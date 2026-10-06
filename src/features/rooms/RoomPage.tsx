import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Menu, Modal, SaveStatus, useAutosave, useUI } from '../../components/ui'
import { CATALOG, CATEGORIES, CATEGORY_EMOJI, FURNITURE_COLORS, MATERIALS, WALL_COLORS, catalogItem, type Category } from './catalog'
import type { Quality } from './scene3d'
import { cm, planBounds, polygonArea, wallLength } from './geometry'
import { PlanEditor, type PlanTool, type Sel } from './PlanEditor'
import { View3D, type View3DHandle } from './View3D'
import type { PlanData, RoomPlan } from './types'
import './rooms.css'

export function RoomPage() {
  const { id } = useParams()
  const p = useLiveQuery(() => db.plans.get(id!), [id])
  if (p === undefined) return null
  if (!p)
    return (
      <div className="page narrow empty">
        <span className="hand">Introuvable</span>Ce plan n’existe plus.
      </div>
    )
  return <RoomEditor key={p.id} initial={p} />
}

type ViewMode = 'plan' | 'iso' | 'free' | 'split'

/** Qualité 3D : « éco » par défaut sur les petites machines, mémorisée ensuite. */
function initialQuality(): Quality {
  try {
    const q = localStorage.getItem('minion-3d-quality')
    if (q === 'eco' || q === 'belle') return q
  } catch {
    /* stockage indisponible */
  }
  const nav = navigator as Navigator & { deviceMemory?: number }
  const weak = (nav.hardwareConcurrency ?? 4) <= 4 || (nav.deviceMemory ?? 8) <= 4
  return weak ? 'eco' : 'belle'
}

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const TOOLS: { id: PlanTool; label: string; icon: string; hint: string }[] = [
  { id: 'select', label: 'Sélection', icon: 'direct', hint: 'Clic : choisir · glisser : déplacer · R : pivoter de 90° · Suppr : retirer' },
  { id: 'room', label: 'Pièce', icon: 'square', hint: 'Glisse pour tracer une pièce rectangulaire (murs + sol)' },
  { id: 'wall', label: 'Mur', icon: 'line', hint: 'Clic pour chaque coin · clic sur le 1er point pour fermer · Entrée / double-clic pour finir · Maj : angles droits' },
  { id: 'door', label: 'Porte', icon: 'door', hint: 'Clique sur un mur pour y placer une porte' },
  { id: 'window', label: 'Fenêtre', icon: 'window', hint: 'Clique sur un mur pour y placer une fenêtre' },
  { id: 'light', label: 'Lumière', icon: 'sun', hint: 'Clique pour placer un point lumineux' },
  { id: 'pan', label: 'Main', icon: 'hand', hint: 'Glisse pour te déplacer · molette : zoom' },
]

function RoomEditor({ initial }: { initial: RoomPlan }) {
  const navigate = useNavigate()
  const { toast, confirm } = useUI()
  const [plan, setPlan] = useState<RoomPlan>(initial)
  const [view, setView] = useState<ViewMode>('plan')
  const [tool, setTool] = useState<PlanTool>('select')
  const [placing, setPlacing] = useState<string | null>(null)
  const [sel, setSel] = useState<Sel>(null)
  const [cut, setCut] = useState(true)
  const [fitSignal, setFitSignal] = useState(0)
  const [libOpen, setLibOpen] = useState(true)
  const [cat, setCat] = useState<Category>('Salon')
  const [query, setQuery] = useState('')
  const [quality, setQualityState] = useState<Quality>(initialQuality)
  const setQuality = (q: Quality) => {
    setQualityState(q)
    try {
      localStorage.setItem('minion-3d-quality', q)
    } catch {
      /* stockage indisponible */
    }
  }
  const [variantName, setVariantName] = useState<string | null>(null)
  const three = useRef<View3DHandle>(null)
  const past = useRef<PlanData[]>([])
  const future = useRef<PlanData[]>([])
  const data = plan.data

  const state = useAutosave(plan, (p) => db.plans.update(initial.id, { title: p.title, data: p.data, variants: p.variants, ambience: p.ambience, updatedAt: Date.now() }), 700)
  useEffect(() => {
    db.plans.update(initial.id, { openedAt: Date.now() })
  }, [initial.id])

  const dataRef = useRef(data)
  dataRef.current = data
  const gestureStart = useRef<PlanData | null>(null)
  const onChange = useCallback((d: PlanData, commit: boolean) => {
    if (!gestureStart.current) gestureStart.current = dataRef.current
    if (commit) {
      past.current.push(gestureStart.current)
      if (past.current.length > 80) past.current.shift()
      future.current = []
      gestureStart.current = null
    }
    setPlan((p) => ({ ...p, data: d }))
  }, [])
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(data)
    setPlan((p) => ({ ...p, data: prev }))
    setSel(null)
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(data)
    setPlan((p) => ({ ...p, data: next }))
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (!e.ctrlKey && !e.altKey) {
        const map: Record<string, PlanTool> = { v: 'select', p: 'room', m: 'wall', o: 'door', f: 'window', l: 'light', h: 'pan' }
        const t = map[e.key.toLowerCase()]
        if (t && view !== 'iso' && view !== 'free') setTool(t)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const patch = (f: (d: PlanData) => PlanData) => onChange(f(data), true)

  /* ---------- exports ---------- */
  const exportPlanPng = async () => {
    const svg = document.querySelector('svg.plan') as SVGSVGElement | null
    if (!svg) return toast('Affiche le plan 2D pour l’exporter.')
    const url = await svgToPng(svg, plan.title)
    download(url, `${plan.title || 'plan'} - plan.png`)
  }
  const export3d = () => {
    const url = three.current?.exportPng()
    if (!url) return toast('Affiche une vue 3D pour l’exporter.')
    download(url, `${plan.title || 'plan'} - 3D.png`)
  }
  const exportPdf = async () => {
    const svg = document.querySelector('svg.plan') as SVGSVGElement | null
    const planUrl = svg ? await svgToPng(svg, plan.title) : null
    const view3d = three.current?.exportPng() ?? null
    const b = planBounds(data)
    const area = data.floors.reduce((s, f) => s + polygonArea(f.points), 0) / 10000
    const w = window.open('', '_blank')
    if (!w) return toast('La fenêtre d’impression a été bloquée.')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.title)}</title><style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: Georgia, serif; color: #2e2a26; margin: 0; }
      h1 { font-weight: 400; margin: 0 0 2mm; font-size: 20pt; }
      .meta { font-family: Arial, sans-serif; font-size: 9pt; color: #5b534b; margin-bottom: 5mm; }
      img { max-width: 100%; max-height: 150mm; display: block; margin: 0 auto 6mm; }
      .rooms { font-family: Arial, sans-serif; font-size: 9pt; columns: 3; }
      .note { font-family: Arial, sans-serif; font-size: 8pt; color: #8a8178; border-top: 0.3mm solid #ddd; padding-top: 3mm; margin-top: 5mm; }
      .page { page-break-after: always; }
    </style></head><body>
      <div class="page"><h1>${esc(plan.title || 'Plan')}</h1>
      <div class="meta">Emprise ≈ ${cm(b.w)} × ${cm(b.h)} · surface des pièces ≈ ${area.toFixed(1).replace('.', ',')} m² · ${data.furniture.length} meubles</div>
      ${planUrl ? `<img src="${planUrl}">` : ''}
      <div class="rooms">${data.floors.map((f) => `<div>${esc(f.name)} : ${(polygonArea(f.points) / 10000).toFixed(1).replace('.', ',')} m²</div>`).join('')}</div>
      <div class="note">Plan d’aménagement et de décoration réalisé avec Minion. Projection personnelle : ce n’est pas un plan technique validé pour construire.</div></div>
      ${view3d ? `<div><h1>${esc(plan.title || 'Plan')} — vue 3D</h1><img src="${view3d}"><div class="note">Rendu généré à partir du plan.</div></div>` : ''}
      <script>setTimeout(() => print(), 400)</script>
    </body></html>`)
    w.document.close()
  }

  /* ---------- variantes ---------- */
  const saveVariant = (name: string) => {
    const v = { id: uid(), name: name.trim() || `Variante ${plan.variants.length + 1}`, data: structuredClone(data), createdAt: Date.now() }
    setPlan((p) => ({ ...p, variants: [...p.variants, v] }))
    toast(`Variante « ${v.name} » enregistrée`)
  }

  const selWall = sel?.kind === 'wall' ? data.walls.find((w) => w.id === sel.id) : null
  const selOpening = sel?.kind === 'opening' ? data.openings.find((o) => o.id === sel.id) : null
  const selFurn = sel?.kind === 'furniture' ? data.furniture.find((o) => o.id === sel.id) : null
  const selFloor = sel?.kind === 'floor' ? data.floors.find((o) => o.id === sel.id) : null
  const selLight = sel?.kind === 'light' ? data.lights.find((o) => o.id === sel.id) : null
  const show2d = view === 'plan' || view === 'split'
  const show3d = view !== 'plan'

  return (
    <div className="room">
      <header className="room-top">
        <button className="btn ghost sm" onClick={() => navigate('/pieces')} aria-label="Retour">
          <Icon name="chevronLeft" size={16} />
        </button>
        <input className="room-title" value={plan.title} placeholder="Nom du plan" onChange={(e) => setPlan((p) => ({ ...p, title: e.target.value }))} />
        <SaveStatus state={state} />
        <span className="spacer" />
        <div className="seg">
          {(['plan', 'iso', 'free', 'split'] as ViewMode[]).map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {{ plan: 'Plan 2D', iso: '3D isométrique', free: '3D libre', split: 'Côte à côte' }[v]}
            </button>
          ))}
        </div>
        <button className="btn ghost icon sm" onClick={undo} title="Annuler (Ctrl+Z)" aria-label="Annuler">
          <Icon name="undo" size={17} />
        </button>
        <button className="btn ghost icon sm" onClick={redo} title="Rétablir (Ctrl+Y)" aria-label="Rétablir">
          <Icon name="redo" size={17} />
        </button>
        <Menu
          trigger={
            <button className="btn sm">
              <Icon name="layers" size={15} /> Variantes {plan.variants.length > 0 && `· ${plan.variants.length}`}
            </button>
          }
          items={[
            { label: 'Enregistrer cette version comme variante…', icon: 'plus', onClick: () => setVariantName('') },
            ...plan.variants.map((v) => ({
              label: `Ouvrir « ${v.name} »`,
              icon: 'copy',
              onClick: async () => {
                if (!(await confirm({ title: `Ouvrir « ${v.name} » ?`, message: 'Le plan actuel sera remplacé par cette variante. Enregistre-le d’abord comme variante si tu veux le garder.', confirmLabel: 'Ouvrir la variante' }))) return
                onChange(structuredClone(v.data), true)
              },
            })),
            ...plan.variants.map((v) => ({ label: `Supprimer « ${v.name} »`, icon: 'trash', danger: true, onClick: () => setPlan((p) => ({ ...p, variants: p.variants.filter((x) => x.id !== v.id) })) })),
          ]}
        />
        <Menu
          trigger={
            <button className="btn sm">
              <Icon name="download" size={15} /> Exporter
            </button>
          }
          items={[
            { label: 'Plan en image (PNG)', icon: 'image', onClick: exportPlanPng },
            { label: 'Vue 3D en image (PNG)', icon: 'image', onClick: export3d },
            { label: 'Plan PDF (impression)', icon: 'printer', onClick: exportPdf },
          ]}
        />
      </header>

      <div className="room-body">
        {show2d && (
          <aside className={`room-lib ${libOpen ? '' : 'closed'}`}>
            <div className="room-tools">
              {TOOLS.map((t) => (
                <button key={t.id} className={`room-tool ${tool === t.id ? 'on' : ''}`} onClick={() => { setTool(t.id); setPlacing(null) }} title={`${t.label} · ${t.hint}`}>
                  <ToolGlyph id={t.icon} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <button className="room-lib-toggle" onClick={() => setLibOpen((o) => !o)}>
              {libOpen ? 'Masquer les meubles' : 'Meubles'}
            </button>
            {libOpen && (
              <div className="room-catalog">
                <p className="room-howto">Clique sur un objet puis sur le plan, ou fais-le glisser directement dessus.</p>
                <input className="input room-search" placeholder="Chercher un objet…" value={query} onChange={(e) => setQuery(e.target.value)} />
                {!query && (
                  <div className="room-cats">
                    {CATEGORIES.map((c) => (
                      <button key={c} className={`room-catbtn ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)} title={c}>
                        <span>{CATEGORY_EMOJI[c]}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="eyebrow room-cat">{query ? 'Résultats' : cat}</div>
                <div className="room-items" key={query ? 'q' : cat}>
                  {CATALOG.filter((c) => (query ? norm(c.name + ' ' + c.category).includes(norm(query)) : c.category === cat)).map((c, i) => (
                    <button
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/minion-furniture', c.id)
                        e.dataTransfer.effectAllowed = 'copy'
                        setPlacing(c.id)
                        setTool('furniture')
                      }}
                      style={{ ['--i' as string]: i }} className={`room-item ${placing === c.id && tool === 'furniture' ? 'on' : ''}`} onClick={() => { setPlacing(c.id); setTool('furniture') }} title={`${c.name} · ${c.w} × ${c.d} cm`}>
                      <span className="room-item-emoji" style={{ background: `color-mix(in srgb, ${c.color} 35%, transparent)` }}>{c.emoji}</span>
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
                {query && !CATALOG.some((c) => norm(c.name + ' ' + c.category).includes(norm(query))) && <p className="faint" style={{ fontSize: '0.8rem', padding: 6 }}>Rien trouvé… essaie un autre mot.</p>}
              </div>
            )}
          </aside>
        )}

        <div className={`room-stage view-${view}`}>
          {show2d && (
            <div className="room-plan">
              <PlanEditor data={data} onChange={onChange} tool={tool} setTool={setTool} placing={placing} sel={sel} setSel={setSel} fitSignal={fitSignal} />
              <div className="room-hint">{tool === 'furniture' && placing ? `Clique pour poser : ${catalogItem(placing)?.name}` : TOOLS.find((t) => t.id === tool)?.hint}</div>
              <button className="btn sm room-fit" onClick={() => setFitSignal((n) => n + 1)}>Tout afficher</button>
            </div>
          )}
          {show3d && (
            <div className="room-3d">
              <View3D key={quality} ref={three} quality={quality} data={data} ambience={plan.ambience} mode={view === 'free' ? 'free' : 'iso'} cutWalls={cut} />
              <div className="room-3d-bar">
                {view !== 'free' && (
                  <>
                    <button className="btn sm" onClick={() => three.current?.rotate(-1)} title="Tourner d’un quart de tour">↺</button>
                    <button className="btn sm" onClick={() => three.current?.rotate(1)} title="Tourner d’un quart de tour">↻</button>
                  </>
                )}
                <button className="btn sm" onClick={() => three.current?.fit()}>Recadrer</button>
                <label className={`se-toggle ${cut ? 'on' : ''}`}>
                  <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} /> Murs coupés
                </label>
                <div className="seg sm">
                  <button className={plan.ambience.time === 'jour' ? 'on' : ''} onClick={() => setPlan((p) => ({ ...p, ambience: { ...p.ambience, time: 'jour' } }))}>Jour</button>
                  <button className={plan.ambience.time === 'doree' ? 'on' : ''} onClick={() => setPlan((p) => ({ ...p, ambience: { ...p.ambience, time: 'doree' } }))}>Doré</button>
                  <button className={plan.ambience.time === 'soir' ? 'on' : ''} onClick={() => setPlan((p) => ({ ...p, ambience: { ...p.ambience, time: 'soir' } }))}>Soir</button>
                </div>
                <div className="seg sm" title="Éco : plus fluide sur un petit ordinateur · Belle : ombres et reflets plus fins">
                  <button className={quality === 'eco' ? 'on' : ''} onClick={() => setQuality('eco')}>Éco</button>
                  <button className={quality === 'belle' ? 'on' : ''} onClick={() => setQuality('belle')}>Belle</button>
                </div>
                <label className="room-slider" title="Soleil">
                  ☀
                  <input type="range" min={0} max={2} step={0.05} value={plan.ambience.sun} onChange={(e) => setPlan((p) => ({ ...p, ambience: { ...p.ambience, sun: +e.target.value } }))} />
                </label>
                <label className="room-slider" title="Lampes">
                  💡
                  <input type="range" min={0} max={2} step={0.05} value={plan.ambience.warm} onChange={(e) => setPlan((p) => ({ ...p, ambience: { ...p.ambience, warm: +e.target.value } }))} />
                </label>
              </div>
              {!show2d && (
                <button className="btn primary sm room-add3d" onClick={() => setView('split')}>
                  <Icon name="plus" size={15} /> Ajouter des meubles
                </button>
              )}
              <div className="room-3d-note">{view === 'free' ? 'Glisser : tourner · clic droit : déplacer · molette : zoom' : 'Molette : zoom · glisser : déplacer'} · généré depuis le plan</div>
            </div>
          )}
        </div>

        {show2d && (
          <aside className="room-inspector">
            {!sel && (
              <div className="room-box">
                <h3>Le plan</h3>
                <p className="faint" style={{ fontSize: '0.84rem', marginTop: 6 }}>
                  {data.floors.length} pièce{data.floors.length > 1 ? 's' : ''} · {(data.floors.reduce((s, f) => s + polygonArea(f.points), 0) / 10000).toFixed(1).replace('.', ',')} m² · {data.walls.length} murs · {data.furniture.length} meubles
                </p>
                <p className="faint" style={{ fontSize: '0.8rem', marginTop: 10 }}>Clique sur un mur, un sol, une porte, un meuble ou une lumière pour le modifier.</p>
              </div>
            )}
            {selWall && (
              <div className="room-box">
                <h3>Mur</h3>
                <Num label="Longueur" value={Math.round(wallLength(selWall))} unit="cm" onChange={(v) => patch((d) => ({ ...d, walls: d.walls.map((w) => (w.id === selWall.id ? setLength(w, v) : w)) }))} />
                <Num label="Épaisseur" value={selWall.thickness} unit="cm" onChange={(v) => patch((d) => ({ ...d, walls: d.walls.map((w) => (w.id === selWall.id ? { ...w, thickness: Math.max(4, v) } : w)) }))} />
                <Num label="Hauteur" value={selWall.height} unit="cm" onChange={(v) => patch((d) => ({ ...d, walls: d.walls.map((w) => (w.id === selWall.id ? { ...w, height: Math.max(50, v) } : w)) }))} />
                <span className="label" style={{ marginTop: 10 }}>Couleur</span>
                <Swatches colors={WALL_COLORS} value={selWall.color} onChange={(c) => patch((d) => ({ ...d, walls: d.walls.map((w) => (w.id === selWall.id ? { ...w, color: c } : w)) }))} />
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => patch((d) => ({ ...d, walls: d.walls.map((w) => ({ ...w, color: selWall.color })) }))}>
                  Appliquer à tous les murs
                </button>
              </div>
            )}
            {selOpening && (
              <div className="room-box">
                <h3>{selOpening.kind === 'door' ? 'Porte' : 'Fenêtre'}</h3>
                <Num label="Largeur" value={selOpening.width} unit="cm" onChange={(v) => patch((d) => ({ ...d, openings: d.openings.map((o) => (o.id === selOpening.id ? { ...o, width: Math.max(30, v) } : o)) }))} />
                <Num label="Hauteur" value={selOpening.height} unit="cm" onChange={(v) => patch((d) => ({ ...d, openings: d.openings.map((o) => (o.id === selOpening.id ? { ...o, height: Math.max(30, v) } : o)) }))} />
                {selOpening.kind === 'window' && <Num label="Allège" value={selOpening.sill} unit="cm" onChange={(v) => patch((d) => ({ ...d, openings: d.openings.map((o) => (o.id === selOpening.id ? { ...o, sill: Math.max(0, v) } : o)) }))} />}
                {selOpening.kind === 'door' && (
                  <button className="btn sm" style={{ marginTop: 8 }} onClick={() => patch((d) => ({ ...d, openings: d.openings.map((o) => (o.id === selOpening.id ? { ...o, flip: !o.flip } : o)) }))}>
                    Inverser le sens d’ouverture
                  </button>
                )}
              </div>
            )}
            {selFurn && (
              <div className="room-box">
                <h3>{catalogItem(selFurn.type)?.name}</h3>
                <input className="input" style={{ marginTop: 8 }} placeholder="Nom affiché (facultatif)" value={selFurn.label ?? ''} onChange={(e) => onChange({ ...data, furniture: data.furniture.map((f) => (f.id === selFurn.id ? { ...f, label: e.target.value } : f)) }, false)} onBlur={() => onChange(data, true)} />
                <Num label="Largeur" value={selFurn.w} unit="cm" onChange={(v) => patch((d) => ({ ...d, furniture: d.furniture.map((f) => (f.id === selFurn.id ? { ...f, w: Math.max(5, v) } : f)) }))} />
                <Num label="Profondeur" value={selFurn.d} unit="cm" onChange={(v) => patch((d) => ({ ...d, furniture: d.furniture.map((f) => (f.id === selFurn.id ? { ...f, d: Math.max(5, v) } : f)) }))} />
                <Num label="Hauteur" value={selFurn.h} unit="cm" onChange={(v) => patch((d) => ({ ...d, furniture: d.furniture.map((f) => (f.id === selFurn.id ? { ...f, h: Math.max(1, v) } : f)) }))} />
                <Num label="Rotation" value={selFurn.rotation} unit="°" onChange={(v) => patch((d) => ({ ...d, furniture: d.furniture.map((f) => (f.id === selFurn.id ? { ...f, rotation: ((v % 360) + 360) % 360 } : f)) }))} />
                <span className="label" style={{ marginTop: 10 }}>Couleur / matière</span>
                <Swatches colors={FURNITURE_COLORS} value={selFurn.color} onChange={(c) => patch((d) => ({ ...d, furniture: d.furniture.map((f) => (f.id === selFurn.id ? { ...f, color: c } : f)) }))} />
                <div className="row" style={{ marginTop: 10, gap: 6 }}>
                  <button className="btn sm" onClick={() => patch((d) => ({ ...d, furniture: [...d.furniture, { ...selFurn, id: uid(), x: selFurn.x + 30, y: selFurn.y + 30 }] }))}>
                    <Icon name="copy" size={14} /> Dupliquer
                  </button>
                  <button className="btn sm danger" onClick={() => { patch((d) => ({ ...d, furniture: d.furniture.filter((f) => f.id !== selFurn.id) })); setSel(null) }}>
                    <Icon name="trash" size={14} /> Retirer
                  </button>
                </div>
              </div>
            )}
            {selFloor && (
              <div className="room-box">
                <h3>Pièce</h3>
                <input className="input" style={{ marginTop: 8 }} value={selFloor.name} onChange={(e) => onChange({ ...data, floors: data.floors.map((f) => (f.id === selFloor.id ? { ...f, name: e.target.value } : f)) }, false)} onBlur={() => onChange(data, true)} />
                <p className="faint" style={{ fontSize: '0.84rem', margin: '8px 0' }}>{(polygonArea(selFloor.points) / 10000).toFixed(2).replace('.', ',')} m²</p>
                <span className="label">Sol</span>
                <div className="room-mats">
                  {MATERIALS.map((m) => (
                    <button key={m.id} className={`room-mat ${selFloor.material === m.id ? 'on' : ''}`} onClick={() => patch((d) => ({ ...d, floors: d.floors.map((f) => (f.id === selFloor.id ? { ...f, material: m.id } : f)) }))}>
                      <span style={{ background: m.color }} />
                      {m.name}
                    </button>
                  ))}
                </div>
                <p className="faint" style={{ fontSize: '0.76rem', marginTop: 8 }}>Les coins du sol se déplacent en les faisant glisser.</p>
              </div>
            )}
            {selLight && (
              <div className="room-box">
                <h3>Lumière</h3>
                <Num label="Hauteur" value={selLight.z} unit="cm" onChange={(v) => patch((d) => ({ ...d, lights: d.lights.map((l) => (l.id === selLight.id ? { ...l, z: Math.max(10, v) } : l)) }))} />
                <label className="room-slider wide">
                  Intensité
                  <input type="range" min={0.1} max={2} step={0.05} value={selLight.intensity} onChange={(e) => onChange({ ...data, lights: data.lights.map((l) => (l.id === selLight.id ? { ...l, intensity: +e.target.value } : l)) }, false)} onPointerUp={() => onChange(data, true)} />
                </label>
                <span className="label" style={{ marginTop: 10 }}>Teinte</span>
                <Swatches colors={['#ffe8c8', '#fff4e0', '#ffffff', '#ffd2a8', '#dfe8ff']} value={selLight.color} onChange={(c) => patch((d) => ({ ...d, lights: d.lights.map((l) => (l.id === selLight.id ? { ...l, color: c } : l)) }))} />
              </div>
            )}
            {sel && (
              <button className="btn ghost sm danger" style={{ margin: '0 16px' }} onClick={() => { const d = { ...data }; if (sel.kind === 'wall') { d.walls = d.walls.filter((w) => w.id !== sel.id); d.openings = d.openings.filter((o) => o.wallId !== sel.id) } else if (sel.kind === 'opening') d.openings = d.openings.filter((o) => o.id !== sel.id); else if (sel.kind === 'furniture') d.furniture = d.furniture.filter((o) => o.id !== sel.id); else if (sel.kind === 'floor') d.floors = d.floors.filter((o) => o.id !== sel.id); else d.lights = d.lights.filter((o) => o.id !== sel.id); onChange(d, true); setSel(null) }}>
                <Icon name="trash" size={14} /> Supprimer l’élément (Suppr)
              </button>
            )}
          </aside>
        )}
      </div>
      <footer className="room-disclaimer">Projection déco et aménagement : ce plan n’est pas un plan technique validé pour construire.</footer>

      <Modal
        open={variantName != null}
        onClose={() => setVariantName(null)}
        title="Enregistrer une variante"
        width={400}
        footer={
          <>
            <button className="btn ghost" onClick={() => setVariantName(null)}>Annuler</button>
            <button className="btn primary" onClick={() => { saveVariant(variantName ?? ''); setVariantName(null) }}>Enregistrer</button>
          </>
        }
      >
        <input className="input" autoFocus placeholder={`Variante ${plan.variants.length + 1} (ex. Canapé contre la fenêtre)`} value={variantName ?? ''} onChange={(e) => setVariantName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { saveVariant(variantName ?? ''); setVariantName(null) } }} />
      </Modal>
    </div>
  )
}

function setLength(w: import('./types').Wall, len: number) {
  const L = Math.max(10, len)
  const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
  return { ...w, b: { x: Math.round(w.a.x + Math.cos(ang) * L), y: Math.round(w.a.y + Math.sin(ang) * L) } }
}

function Num({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (v: number) => void }) {
  const [v, setV] = useState(String(Math.round(value)))
  useEffect(() => setV(String(Math.round(value))), [value])
  return (
    <label className="room-num">
      <span>{label}</span>
      <input
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => !Number.isNaN(+v) && +v !== Math.round(value) && onChange(+v)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="faint">{unit}</span>
    </label>
  )
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="room-swatches">
      {colors.map((c) => (
        <button key={c} className={value === c ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Autre couleur" />
    </div>
  )
}

function ToolGlyph({ id }: { id: string }) {
  if (id === 'door')
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M3 20h18M6 20V6M6 6a14 14 0 0 1 14 14" strokeDasharray="0" />
      </svg>
    )
  if (id === 'window')
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M2 10h20M2 14h20M6 10v4M18 10v4" />
      </svg>
    )
  if (id === 'direct') return <Icon name="move" size={18} />
  if (id === 'line')
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
        <path d="M4 19V6h16" />
      </svg>
    )
  if (id === 'hand')
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v7V6a1.5 1.5 0 0 1 3 0v8c0 4-3 7-6 7-2 0-4-1-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 13" />
      </svg>
    )
  return <Icon name={id} size={18} />
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

/** Plan SVG → image PNG (styles incorporés, cadré sur le plan). */
async function svgToPng(svg: SVGSVGElement, _title: string): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const vb = svg.viewBox.baseVal
  const W = 2000
  const H = Math.round((W * vb.height) / vb.width)
  clone.setAttribute('width', String(W))
  clone.setAttribute('height', String(H))
  const cs = getComputedStyle(document.documentElement)
  const vars = ['--plan-grid', '--plan-grid-major', '--accent', '--accent-wash', '--accent-deep', '--ink', '--ink-soft', '--ink-faint', '--surface', '--paper', '--line']
  const style = document.createElement('style')
  style.textContent = `:root, svg { ${vars.map((v) => `${v}: ${cs.getPropertyValue(v)};`).join(' ')} } ${[...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText).filter((t) => t.includes('.plan')) } catch { return [] } }).join('\n')}`
  clone.insertBefore(style, clone.firstChild)
  const xml = new XMLSerializer().serializeToString(clone)
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  await img.decode()
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = '#ffffff'
  x.fillRect(0, 0, W, H)
  x.drawImage(img, 0, 0, W, H)
  return c.toDataURL('image/png')
}
