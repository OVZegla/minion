import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { pickFiles, saveAsset, useAssetUrl } from '../../db/assets'
import { Icon } from '../../components/Icon'
import { useUI } from '../../components/ui'
import { type Anchor, type VPath, clonePath, dist, mirror, pathDistance, segmentErrors, segments, toSvg } from './bezier'
import { PenCanvas, type PenTool } from './PenCanvas'
import { CHAPTERS, H, LEVELS, W, scoreFrom, starsFrom, type Level } from './levels'
import './pen.css'

type Progress = Record<string, number>

function useProgress() {
  const rec = useLiveQuery(() => db.kv.get('pen-progress'), [])
  const progress = (rec?.value as Progress) ?? {}
  const save = async (id: string, stars: number) => {
    const cur = ((await db.kv.get('pen-progress'))?.value as Progress) ?? {}
    if ((cur[id] ?? 0) >= stars) return
    await db.kv.put({ id: 'pen-progress', value: { ...cur, [id]: stars } })
  }
  return { progress, save }
}

/* =========================================================
   Carte des niveaux
   ========================================================= */

export function PenHomePage() {
  const navigate = useNavigate()
  const { progress } = useProgress()
  const total = LEVELS.filter((l) => !l.free).length * 3
  const got = Object.values(progress).reduce((a, b) => a + b, 0)
  return (
    <div className="page pen-home">
      <div className="page-head">
        <div>
          <h1>Atelier plume</h1>
          <p className="sub">Apprendre l’outil plume pas à pas, avec les mêmes gestes et raccourcis que dans Photoshop.</p>
        </div>
        <span className="spacer" />
        <span className="chip">★ {got} / {total}</span>
      </div>
      <div className="pen-keys card pad">
        <b>Les gestes de la plume</b>
        <div className="pen-keys-grid">
          <span><kbd>P</kbd> Plume</span>
          <span><kbd>A</kbd> Sélection directe</span>
          <span><kbd>Clic</kbd> Point d’angle</span>
          <span><kbd>Clic-glisser</kbd> Point courbe</span>
          <span><kbd>Maj</kbd> Angles à 45°</span>
          <span><kbd>Alt</kbd> Casser / convertir les poignées</span>
          <span><kbd>Ctrl</kbd> Sélection directe temporaire</span>
          <span><kbd>Ctrl Z</kbd> Annuler</span>
          <span><kbd>Échap</kbd> Terminer le tracé</span>
        </div>
      </div>
      {CHAPTERS.map((c, ci) => (
        <section key={c} className="pen-chapter">
          <h3>
            <span className="pen-chapter-num">{ci + 1}</span> {c}
          </h3>
          <div className="pen-levels">
            {LEVELS.filter((l) => l.chapter === ci).map((l) => (
              <button key={l.id} className="card pen-level" onClick={() => navigate(`/plume/${l.id}`)}>
                <svg viewBox={`0 0 ${W} ${H}`} className="pen-level-preview">
                  {l.target ? <path d={toSvg(l.target)} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" /> : <text x={W / 2} y={H / 2 + 30} textAnchor="middle" fontSize={120} fill="currentColor">✎</text>}
                </svg>
                <div className="pen-level-title">{l.title}</div>
                {!l.free && (
                  <div className="pen-stars">
                    {[1, 2, 3].map((s) => (
                      <span key={s} className={(progress[l.id] ?? 0) >= s ? 'on' : ''}>★</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/* =========================================================
   Jeu
   ========================================================= */

interface Result {
  score: number
  stars: number
  messages: string[]
  badSeg: number | null
}

export function PenLevelPage() {
  const { levelId } = useParams()
  const level = LEVELS.find((l) => l.id === levelId)
  if (!level) return <div className="page empty">Niveau introuvable.</div>
  return <PenLevel key={level.id} level={level} />
}

function PenLevel({ level }: { level: Level }) {
  const navigate = useNavigate()
  const { toast } = useUI()
  const { progress, save } = useProgress()
  const [path, setPath] = useState<VPath>(() => (level.start ? clonePath(level.start) : { anchors: [], closed: false }))
  const [tool, setTool] = useState<PenTool>(level.start ? 'direct' : 'pen')
  const [showPoints, setShowPoints] = useState(!!level.showPoints)
  const [showHandles, setShowHandles] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [demo, setDemo] = useState(false)
  const [mods, setMods] = useState({ ctrl: false, alt: false, shift: false })
  const [resetKey, setResetKey] = useState(0)
  // atelier libre
  const freeRec = useLiveQuery(async () => (level.free ? ((await db.kv.get('pen-free')) ?? null) : null), [level.free])
  const freeLoaded = useRef(false)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [templateOpacity, setTemplateOpacity] = useState(0.5)
  const [done, setDone] = useState<VPath[]>([])
  const templateUrl = useAssetUrl(templateId)

  useEffect(() => {
    if (!level.free || freeLoaded.current || freeRec === undefined) return
    freeLoaded.current = true
    const v = freeRec?.value as { path?: VPath; done?: VPath[]; templateId?: string | null; opacity?: number } | undefined
    if (v?.path) setPath(v.path)
    if (v?.done) setDone(v.done)
    if (v?.templateId) setTemplateId(v.templateId)
    if (v?.opacity != null) setTemplateOpacity(v.opacity)
  }, [freeRec, level.free])
  useEffect(() => {
    if (!level.free || !freeLoaded.current) return
    const t = window.setTimeout(() => db.kv.put({ id: 'pen-free', value: { path, done, templateId, opacity: templateOpacity } }), 400)
    return () => window.clearTimeout(t)
  }, [path, done, templateId, templateOpacity, level.free])

  useEffect(() => {
    const k = (e: KeyboardEvent) => setMods({ ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey })
    window.addEventListener('keydown', k)
    window.addEventListener('keyup', k)
    return () => {
      window.removeEventListener('keydown', k)
      window.removeEventListener('keyup', k)
    }
  }, [])

  const idx = LEVELS.findIndex((l) => l.id === level.id)
  const next = LEVELS[idx + 1]
  const target = level.target

  const verify = (p: VPath = path) => {
    if (!target) return
    const messages: string[] = []
    if (p.anchors.length < 2) {
      setResult({ score: 0, stars: 0, messages: ['Pose au moins deux points pour former un tracé.'], badSeg: null })
      return
    }
    const d = pathDistance(target, p)
    let score = scoreFrom(d)
    if (target.closed && !p.closed) {
      score = Math.min(score, 49)
      messages.push('La forme n’est pas fermée : reviens cliquer sur le premier point (le curseur affiche « o »).')
    }
    const errs = segmentErrors(target, p)
    let badSeg: number | null = null
    let worst = 0
    errs.forEach((e, i) => {
      if (e.mean > worst) {
        worst = e.mean
        badSeg = i
      }
    })
    if (worst < 6) badSeg = null
    if (badSeg != null) {
      const s = segments(target)[badSeg]
      const curved = dist(s[0], s[1]) > 1 || dist(s[2], s[3]) > 1
      messages.push(
        curved
          ? `Le passage en rouge s’écarte du modèle (≈ ${Math.round(worst)} px). Avec Ctrl, ajuste la longueur et l’angle de ses poignées.`
          : `Le passage en rouge devrait être droit (≈ ${Math.round(worst)} px d’écart). Vérifie qu’aucune poignée ne dépasse : Alt + clic sur le point la retire.`,
      )
    }
    const extra = p.anchors.length - target.anchors.length
    if (extra >= 2) messages.push(`Tu as utilisé ${p.anchors.length} points, le modèle en a ${target.anchors.length}. Des poignées plus longues permettent souvent d’en mettre moins.`)
    if (extra === 0 && score >= 85) messages.push('Même nombre de points que le modèle : c’est exactement ainsi qu’on travaille dans Photoshop.')
    const stars = starsFrom(score)
    if (stars === 3) messages.unshift('Magnifique, c’est précis !')
    else if (stars === 2) messages.unshift('Très bien ! Encore un peu de précision pour la 3e étoile.')
    else if (stars === 1) messages.unshift('C’est validé. Tu peux affiner pour gagner des étoiles.')
    else if (!messages.length) messages.push('Pas encore : rapproche ton tracé du modèle.')
    setResult({ score, stars, messages, badSeg })
    if (stars) save(level.id, stars)
  }

  const reset = () => {
    setPath(level.start ? clonePath(level.start) : { anchors: [], closed: false })
    setResult(null)
    setResetKey((k) => k + 1)
  }

  const exportSvg = () => {
    const all = [...done, path].filter((p) => p.anchors.length > 1)
    if (!all.length) return toast('Rien à exporter pour l’instant.')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n${all.map((p) => `  <path d="${toSvg(p)}" fill="none" stroke="#2e2a26" stroke-width="2"/>`).join('\n')}\n</svg>`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    a.download = 'trace-minion.svg'
    a.click()
  }

  const under = (
    <>
      {templateUrl && <image href={templateUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid meet" opacity={templateOpacity} pointerEvents="none" />}
      {done.map((p, i) => (
        <path key={i} d={toSvg(p)} fill="none" stroke="#2e2a26" strokeWidth={2} pointerEvents="none" />
      ))}
      {target && (
        <g pointerEvents="none">
          <path d={toSvg(target)} fill="none" stroke="#d8dbe0" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          {result?.badSeg != null && <path d={segPath(target, result.badSeg)} fill="none" stroke="#e5484d" strokeOpacity={0.55} strokeWidth={9} strokeLinecap="round" />}
          {showHandles &&
            target.anchors.map((a, i) => (
              <g key={'th' + i}>
                {a.hIn && <line x1={a.x} y1={a.y} x2={a.hIn.x} y2={a.hIn.y} stroke="#9aa3ad" strokeDasharray="4 3" />}
                {a.hOut && <line x1={a.x} y1={a.y} x2={a.hOut.x} y2={a.hOut.y} stroke="#9aa3ad" strokeDasharray="4 3" />}
                {a.hIn && <circle cx={a.hIn.x} cy={a.hIn.y} r={4} fill="none" stroke="#9aa3ad" />}
                {a.hOut && <circle cx={a.hOut.x} cy={a.hOut.y} r={4} fill="none" stroke="#9aa3ad" />}
              </g>
            ))}
          {showPoints && target.anchors.map((a, i) => <circle key={'tp' + i} cx={a.x} cy={a.y} r={7} fill="#fff" stroke="#9aa3ad" strokeWidth={2} />)}
          {showPoints && target.anchors[0] && (
            <text x={target.anchors[0].x} y={target.anchors[0].y - 14} textAnchor="middle" fontSize={13} fill="#7d8691" fontFamily="Inter Variable, sans-serif">
              départ
            </text>
          )}
        </g>
      )}
    </>
  )

  const effTool = mods.ctrl ? 'direct' : tool

  return (
    <div className="ps">
      {/* barre de menus façon Photoshop */}
      <header className="ps-menubar">
        <button className="ps-back" onClick={() => navigate('/plume')}>
          <Icon name="chevronLeft" size={15} /> Atelier plume
        </button>
        <span className="ps-doc-title">
          {CHAPTERS[level.chapter]} · {level.title}
        </span>
        {!level.free && (
          <span className="pen-stars ps-stars">
            {[1, 2, 3].map((s) => (
              <span key={s} className={(progress[level.id] ?? 0) >= s ? 'on' : ''}>★</span>
            ))}
          </span>
        )}
      </header>
      {/* barre d'options de l'outil */}
      <div className="ps-options">
        <span className="ps-opt-tool">{effTool === 'pen' ? 'Plume' : 'Sélection directe'}</span>
        <span className="ps-opt-sep" />
        {effTool === 'pen' ? (
          <span className="ps-opt-help">Clic : point d’angle · Clic-glisser : courbe · Clic sur le 1er point : fermer · Échap : terminer</span>
        ) : (
          <span className="ps-opt-help">Glisser un point ou une poignée · Alt : poignée indépendante · Suppr : effacer le point</span>
        )}
        <span className="spacer" />
        <span className={`ps-mod ${mods.shift ? 'on' : ''}`}>Maj</span>
        <span className={`ps-mod ${mods.alt ? 'on' : ''}`}>Alt</span>
        <span className={`ps-mod ${mods.ctrl ? 'on' : ''}`}>Ctrl</span>
      </div>

      <div className="ps-body">
        {/* barre d'outils */}
        <nav className="ps-tools">
          <button className={`ps-tool ${effTool === 'pen' ? 'on' : ''}`} onClick={() => setTool('pen')} title="Plume (P)">
            <PenIcon />
            <span className="ps-tool-key">P</span>
          </button>
          <button className={`ps-tool ${effTool === 'direct' ? 'on' : ''}`} onClick={() => setTool('direct')} title="Sélection directe (A)">
            <DirectIcon />
            <span className="ps-tool-key">A</span>
          </button>
        </nav>

        <div className="ps-canvas">
          <div className="ps-artboard">
            <PenCanvas
              key={resetKey}
              width={W}
              height={H}
              value={path}
              onChange={setPath}
              tool={tool}
              setTool={setTool}
              under={under}
              over={demo && target ? <Demo target={target} onEnd={() => setDemo(false)} /> : null}
              onCommit={(p) => {
                setResult(null)
                if (target?.closed && p.closed) verify(p)
              }}
            />
          </div>
        </div>

        {/* panneau d'aide (comme un panneau Propriétés) */}
        <aside className="ps-panel">
          <div className="ps-panel-title">Consigne</div>
          <p className="ps-goal">{level.goal}</p>
          <ul className="ps-tips">
            {level.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <div className="ps-keychips">
            {level.keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </div>

          {target && (
            <>
              <div className="ps-panel-title">Aide</div>
              <button className="ps-btn" onClick={() => setDemo(true)} disabled={demo}>
                ▶ Voir la démonstration
              </button>
              <label className="ps-check">
                <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} /> Montrer les points
              </label>
              <label className="ps-check">
                <input type="checkbox" checked={showHandles} onChange={(e) => setShowHandles(e.target.checked)} /> Montrer les poignées
              </label>
            </>
          )}

          {level.free && (
            <>
              <div className="ps-panel-title">Modèle à décalquer</div>
              <button
                className="ps-btn"
                onClick={async () => {
                  const [f] = await pickFiles('image/*')
                  if (f) setTemplateId(await saveAsset(f))
                }}
              >
                {templateId ? 'Changer d’image' : 'Importer une image'}
              </button>
              {templateId && (
                <>
                  <label className="ps-check">
                    Opacité
                    <input type="range" min={0.1} max={1} step={0.05} value={templateOpacity} onChange={(e) => setTemplateOpacity(+e.target.value)} />
                  </label>
                  <button className="ps-btn ghost" onClick={() => setTemplateId(null)}>Retirer l’image</button>
                </>
              )}
              <div className="ps-panel-title">Tracés</div>
              <button
                className="ps-btn"
                onClick={() => {
                  if (path.anchors.length > 1) setDone([...done, path])
                  setPath({ anchors: [], closed: false })
                  setResetKey((k) => k + 1)
                }}
              >
                + Nouveau tracé
              </button>
              <button className="ps-btn" onClick={exportSvg}>Exporter en SVG</button>
              <button className="ps-btn ghost" onClick={() => { setDone([]); reset() }}>Tout effacer</button>
            </>
          )}

          <div className="ps-actions">
            <button className="ps-btn ghost" onClick={reset}>Recommencer</button>
            {target && (
              <button className="ps-btn primary" onClick={() => verify()}>
                Vérifier mon tracé
              </button>
            )}
          </div>

          {result && (
            <div className={`ps-result s${result.stars}`}>
              <div className="pen-stars big">
                {[1, 2, 3].map((s) => (
                  <span key={s} className={result.stars >= s ? 'on' : ''}>★</span>
                ))}
              </div>
              <div className="ps-score">Précision : {result.score} %</div>
              {result.messages.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
              {result.stars > 0 && next && (
                <button className="ps-btn primary" onClick={() => navigate(`/plume/${next.id}`)}>
                  Niveau suivant : {next.title} →
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function segPath(p: VPath, i: number) {
  const s = segments(p)[i]
  return `M ${s[0].x} ${s[0].y} C ${s[1].x} ${s[1].y} ${s[2].x} ${s[2].y} ${s[3].x} ${s[3].y}`
}

/* ---------- Démonstration animée : un curseur fantôme dessine le modèle ---------- */

function Demo({ target, onEnd }: { target: VPath; onEnd: () => void }) {
  const steps = useMemo(() => {
    const s = target.anchors.map((a, i) => ({ i, a, drag: !!a.hOut || (i === 0 && !!a.hIn && target.closed && false), cusp: !!a.hIn && !!a.hOut && !isMirror(a) }))
    return s
  }, [target])
  const total = steps.length + (target.closed ? 1 : 0)
  const STEP = 1300
  const [t, setT] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      const el = now - t0
      setT(el)
      if (el < total * STEP + 800) raf = requestAnimationFrame(loop)
      else onEnd()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [total]) // eslint-disable-line react-hooks/exhaustive-deps

  const k = Math.min(total - 1, Math.floor(t / STEP))
  const ph = Math.min(1, (t - k * STEP) / STEP)
  const anchors: Anchor[] = []
  let cursor = target.anchors[0]
  let caption = ''
  for (let j = 0; j <= Math.min(k, steps.length - 1); j++) {
    const st = steps[j]
    const a = st.a
    if (j < k) anchors.push(a)
    else {
      const prev = j > 0 ? target.anchors[j - 1] : a
      const move = Math.min(1, ph / 0.35)
      cursor = { x: prev.x + (a.x - prev.x) * ease(move), y: prev.y + (a.y - prev.y) * ease(move), hIn: null, hOut: null }
      if (ph >= 0.35) {
        const g = ease(Math.min(1, (ph - 0.35) / 0.5))
        if (a.hOut) {
          const hOut = { x: a.x + (a.hOut.x - a.x) * g, y: a.y + (a.hOut.y - a.y) * g }
          const hIn = st.cusp ? a.hIn : a.hIn ? mirror(hOut, a) : null
          anchors.push({ ...a, hOut, hIn })
          cursor = { ...hOut, hIn: null, hOut: null }
          caption = st.cusp ? 'clic-glisser, puis Alt' : 'clic-glisser'
        } else {
          anchors.push(a)
          caption = a.hIn && j === 0 ? 'clic' : 'clic'
        }
      } else caption = j === 0 ? 'on commence ici' : ''
    }
  }
  let closed = false
  if (target.closed && k === total - 1) {
    const first = target.anchors[0]
    const lastA = target.anchors[target.anchors.length - 1]
    const move = Math.min(1, ph / 0.4)
    cursor = { x: lastA.x + (first.x - lastA.x) * ease(move), y: lastA.y + (first.y - lastA.y) * ease(move), hIn: null, hOut: null }
    if (ph > 0.45) {
      closed = true
      caption = 'clic sur le 1er point : fermé !'
    } else caption = 'retour au premier point…'
  }
  const ghost: VPath = { anchors, closed }
  return (
    <g pointerEvents="none" className="pen-demo">
      <rect width={W} height={H} fill="rgba(255,255,255,0.35)" />
      <path d={toSvg(ghost)} fill="none" stroke="#e8a33a" strokeWidth={2.5} />
      {anchors.map((a, i) => (
        <g key={i}>
          {a.hOut && i === anchors.length - 1 && <line x1={a.x} y1={a.y} x2={a.hOut.x} y2={a.hOut.y} stroke="#e8a33a" />}
          {a.hIn && i === anchors.length - 1 && <line x1={a.x} y1={a.y} x2={a.hIn.x} y2={a.hIn.y} stroke="#e8a33a" />}
          <rect x={a.x - 4} y={a.y - 4} width={8} height={8} fill="#e8a33a" />
        </g>
      ))}
      <g transform={`translate(${cursor.x} ${cursor.y})`}>
        <path d="M0 0 L6 14 L9 11 L14 16 L16 14 L11 9 L14 6 Z" fill="#fff" stroke="#000" strokeWidth={1.2} />
      </g>
      {caption && (
        <g transform={`translate(${cursor.x + 18} ${cursor.y + 34})`}>
          <rect x={-6} y={-15} width={caption.length * 7.2 + 12} height={22} rx={11} fill="#2e2a26" />
          <text fontSize={13} fill="#fff" fontFamily="Inter Variable, sans-serif">{caption}</text>
        </g>
      )}
    </g>
  )
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3)
const isMirror = (a: Anchor) => !!a.hIn && !!a.hOut && dist(mirror(a.hOut, a), a.hIn) < 2

/* ---------- icônes d'outils dessinées pour Minion ---------- */
function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M4 20 L7 12 L12 7 L17 12 L12 17 Z" />
      <path d="M12 7 L14 3 L21 10 L17 12" />
      <circle cx="11" cy="13" r="1.3" fill="currentColor" />
      <path d="M4 20 L10 14" />
    </svg>
  )
}
function DirectIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M6 3 L6 19 L10 15 L13 21 L15.5 20 L12.5 14 L18 14 Z" />
    </svg>
  )
}
