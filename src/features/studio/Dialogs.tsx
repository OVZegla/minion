import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStudio } from './context'
import { activeLayer } from './store'
import { actions, editableRaster, replaceLayer } from './actions'
import { applyFilter, applyOp, canvasToBlob, curveLut, flatten, ops, sharpen } from './engine'
import type { SDocState } from './types'

export function PsDialog({ title, children, onOk, onCancel, okLabel = 'OK', width = 420 }: { title: string; children: ReactNode; onOk?: () => void; onCancel: () => void; okLabel?: string; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && onOk && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault()
        onOk()
      }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  })
  return (
    <div className="psd-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="psd" style={{ width }} onKeyDown={(e) => e.stopPropagation()}>
        <div className="psd-title">{title}</div>
        <div className="psd-body">{children}</div>
        <div className="psd-foot">
          {onOk && <button className="ps-btn primary inline" onClick={onOk}>{okLabel}</button>}
          <button className="ps-btn inline" onClick={onCancel}>{onOk ? 'Annuler' : 'Fermer'}</button>
        </div>
      </div>
    </div>
  )
}

function Slider({ label, min, max, step = 1, value, onChange, unit = '' }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label className="psd-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      {unit && <span className="psd-unit">{unit}</span>}
    </label>
  )
}

/* =========================================================
   Nouveau document
   ========================================================= */

export const PRESETS = [
  { name: 'Publication Instagram', w: 1080, h: 1080 },
  { name: 'Story / téléphone', w: 1080, h: 1920 },
  { name: 'HD 1920 × 1080', w: 1920, h: 1080 },
  { name: 'A4 (150 ppp)', w: 1240, h: 1754 },
  { name: 'Carte postale', w: 1748, h: 1240 },
  { name: 'Logo', w: 1000, h: 1000 },
]

export function NewDocDialog({ onCreate, onCancel }: { onCreate: (o: { title: string; w: number; h: number; bg: string | null }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('Sans titre-1')
  const [w, setW] = useState(1080)
  const [h, setH] = useState(1080)
  const [bg, setBg] = useState<'white' | 'transparent' | 'cream'>('white')
  return (
    <PsDialog title="Nouveau document" onCancel={onCancel} okLabel="Créer" width={520} onOk={() => onCreate({ title, w: Math.max(1, Math.min(8000, w)), h: Math.max(1, Math.min(8000, h)), bg: bg === 'white' ? '#ffffff' : bg === 'cream' ? '#faf6ef' : null })}>
      <div className="psd-presets">
        {PRESETS.map((p) => (
          <button key={p.name} className={`psd-preset ${w === p.w && h === p.h ? 'on' : ''}`} onClick={() => { setW(p.w); setH(p.h) }}>
            <span className="psd-preset-shape" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
            <b>{p.name}</b>
            <small>{p.w} × {p.h}</small>
          </button>
        ))}
      </div>
      <label className="psd-field">Nom<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="psd-row">
        <label className="psd-field">Largeur<input type="number" value={w} onChange={(e) => setW(+e.target.value)} /> px</label>
        <label className="psd-field">Hauteur<input type="number" value={h} onChange={(e) => setH(+e.target.value)} /> px</label>
      </div>
      <label className="psd-field">
        Contenu de l’arrière-plan
        <select value={bg} onChange={(e) => setBg(e.target.value as typeof bg)}>
          <option value="white">Blanc</option>
          <option value="cream">Crème</option>
          <option value="transparent">Transparent</option>
        </select>
      </label>
    </PsDialog>
  )
}

/* =========================================================
   Réglages et filtres avec aperçu
   ========================================================= */

export type AdjustKind = 'levels' | 'curves' | 'huesat' | 'brightness' | 'threshold' | 'blur' | 'sharpen' | 'noise'
const ADJUST_TITLE: Record<AdjustKind, string> = {
  levels: 'Niveaux',
  curves: 'Courbes',
  huesat: 'Teinte/Saturation',
  brightness: 'Luminosité/Contraste',
  threshold: 'Seuil',
  blur: 'Flou gaussien',
  sharpen: 'Netteté',
  noise: 'Ajout de bruit',
}

export function AdjustDialog({ kind, onClose }: { kind: AdjustKind; onClose: () => void }) {
  const { store, confirmRasterize, notify } = useStudio()
  const orig = useRef<SDocState | null>(null)
  const [ready, setReady] = useState(false)
  const [p, setP] = useState<Record<string, number>>(() => defaults(kind))
  const [curve, setCurve] = useState([{ x: 0, y: 0 }, { x: 64, y: 64 }, { x: 128, y: 128 }, { x: 192, y: 192 }, { x: 255, y: 255 }])
  const timer = useRef(0)

  useEffect(() => {
    ;(async () => {
      const s = store.state
      const l = activeLayer(s)
      if (!l || l.kind === 'group') {
        notify('Choisis un calque de pixels.')
        return onClose()
      }
      if ((l.kind === 'text' || l.kind === 'shape') && !(await confirmRasterize())) return onClose()
      const r = editableRaster(store.state)
      if (!r) return onClose()
      if (r.state !== store.state) store.commit('Pixelliser le calque', r.state)
      orig.current = store.state
      setReady(true)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const compute = (s: SDocState) => {
    const l = activeLayer(s)
    if (!l || l.kind !== 'raster') return s
    let c = l.canvas
    switch (kind) {
      case 'levels': c = applyOp(c, ops.levels(p.black, p.gamma, p.white, p.outBlack, p.outWhite), s.selection, l.matrix); break
      case 'curves': c = applyOp(c, ops.curves(curve), s.selection, l.matrix); break
      case 'huesat': c = applyOp(c, ops.hueSat(p.hue, p.sat, p.light), s.selection, l.matrix); break
      case 'brightness': c = applyOp(c, ops.brightnessContrast(p.b, p.c), s.selection, l.matrix); break
      case 'threshold': c = applyOp(c, ops.threshold(p.t), s.selection, l.matrix); break
      case 'blur': c = applyFilter(c, `blur(${p.r}px)`, s.selection, l.matrix); break
      case 'sharpen': c = sharpen(c, p.k, s.selection, l.matrix); break
      case 'noise': c = applyOp(c, ops.noise(p.n), s.selection, l.matrix); break
    }
    return replaceLayer(s, { ...l, canvas: c })
  }

  useEffect(() => {
    if (!ready || !orig.current) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => store.replace(compute(orig.current!)), 60)
  }, [p, curve, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = () => {
    window.clearTimeout(timer.current)
    if (orig.current) store.replace(orig.current)
    onClose()
  }
  const ok = () => {
    window.clearTimeout(timer.current)
    if (!orig.current) return onClose()
    const next = compute(orig.current)
    store.replace(orig.current)
    store.commit(ADJUST_TITLE[kind], next)
    onClose()
  }
  if (!ready) return null
  const set = (k: string) => (v: number) => setP((x) => ({ ...x, [k]: v }))

  return (
    <PsDialog title={ADJUST_TITLE[kind]} onOk={ok} onCancel={cancel} width={kind === 'curves' ? 380 : 420}>
      {kind === 'levels' && (
        <>
          <p className="psd-label">Niveaux d’entrée</p>
          <Slider label="Noirs" min={0} max={253} value={p.black} onChange={set('black')} />
          <Slider label="Gamma" min={0.1} max={4} step={0.01} value={p.gamma} onChange={set('gamma')} />
          <Slider label="Blancs" min={2} max={255} value={p.white} onChange={set('white')} />
          <p className="psd-label">Niveaux de sortie</p>
          <Slider label="Noirs" min={0} max={255} value={p.outBlack} onChange={set('outBlack')} />
          <Slider label="Blancs" min={0} max={255} value={p.outWhite} onChange={set('outWhite')} />
        </>
      )}
      {kind === 'curves' && <CurveEditor points={curve} onChange={setCurve} />}
      {kind === 'huesat' && (
        <>
          <Slider label="Teinte" min={-180} max={180} value={p.hue} onChange={set('hue')} />
          <Slider label="Saturation" min={-100} max={100} value={p.sat} onChange={set('sat')} />
          <Slider label="Luminosité" min={-100} max={100} value={p.light} onChange={set('light')} />
        </>
      )}
      {kind === 'brightness' && (
        <>
          <Slider label="Luminosité" min={-150} max={150} value={p.b} onChange={set('b')} />
          <Slider label="Contraste" min={-100} max={100} value={p.c} onChange={set('c')} />
        </>
      )}
      {kind === 'threshold' && <Slider label="Seuil" min={1} max={255} value={p.t} onChange={set('t')} />}
      {kind === 'blur' && <Slider label="Rayon" min={0.1} max={100} step={0.1} value={p.r} onChange={set('r')} unit="px" />}
      {kind === 'sharpen' && <Slider label="Intensité" min={0.1} max={2} step={0.05} value={p.k} onChange={set('k')} />}
      {kind === 'noise' && <Slider label="Quantité" min={1} max={100} value={p.n} onChange={set('n')} unit="%" />}
      <p className="psd-hint">Aperçu en direct · s’applique au calque actif{store.state.selection ? ', dans la sélection' : ''}.</p>
    </PsDialog>
  )
}

function defaults(kind: AdjustKind): Record<string, number> {
  switch (kind) {
    case 'levels': return { black: 0, gamma: 1, white: 255, outBlack: 0, outWhite: 255 }
    case 'huesat': return { hue: 0, sat: 0, light: 0 }
    case 'brightness': return { b: 0, c: 0 }
    case 'threshold': return { t: 128 }
    case 'blur': return { r: 4 }
    case 'sharpen': return { k: 0.5 }
    case 'noise': return { n: 12 }
    default: return {}
  }
}

function CurveEditor({ points, onChange }: { points: { x: number; y: number }[]; onChange: (p: { x: number; y: number }[]) => void }) {
  const ref = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const lut = curveLut(points)
  const toPt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: Math.round(Math.min(255, Math.max(0, ((e.clientX - r.left) / r.width) * 255))), y: Math.round(Math.min(255, Math.max(0, (1 - (e.clientY - r.top) / r.height) * 255))) }
  }
  return (
    <svg
      ref={ref}
      viewBox="0 0 255 255"
      className="psd-curve"
      onPointerDown={(e) => {
        ;(e.target as Element).setPointerCapture(e.pointerId)
        const p = toPt(e)
        const i = points.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 12)
        if (i >= 0) setDrag(i)
        else {
          const next = [...points, p].sort((a, b) => a.x - b.x)
          onChange(next)
          setDrag(next.indexOf(p))
        }
      }}
      onPointerMove={(e) => {
        if (drag == null) return
        const p = toPt(e)
        const next = points.map((q, i) => (i === drag ? (i === 0 || i === points.length - 1 ? { x: q.x, y: p.y } : p) : q))
        onChange(next)
      }}
      onPointerUp={() => setDrag(null)}
    >
      {[64, 128, 192].map((g) => (
        <g key={g} stroke="#555" strokeWidth={0.5}>
          <line x1={g} x2={g} y1={0} y2={255} />
          <line y1={g} y2={g} x1={0} x2={255} />
        </g>
      ))}
      <line x1={0} y1={255} x2={255} y2={0} stroke="#666" strokeWidth={0.6} strokeDasharray="3 3" />
      <polyline points={Array.from(lut).map((v, x) => `${x},${255 - v}`).join(' ')} fill="none" stroke="#fff" strokeWidth={1.4} />
      {points.map((p, i) => (
        <rect key={i} x={p.x - 3.5} y={255 - p.y - 3.5} width={7} height={7} fill={drag === i ? '#2f80ed' : '#fff'} />
      ))}
    </svg>
  )
}

/* =========================================================
   Taille de l'image / de la zone de travail
   ========================================================= */

export function SizeDialog({ mode, onClose }: { mode: 'image' | 'canvas'; onClose: () => void }) {
  const { store } = useStudio()
  const s = store.state
  const [w, setW] = useState(s.width)
  const [h, setH] = useState(s.height)
  const [keep, setKeep] = useState(true)
  const ratio = s.width / s.height
  return (
    <PsDialog
      title={mode === 'image' ? 'Taille de l’image' : 'Taille de la zone de travail'}
      onCancel={onClose}
      onOk={() => {
        if (mode === 'image') actions.imageSize(store, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
        else actions.canvasSize(store, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
        onClose()
      }}
    >
      <div className="psd-row">
        <label className="psd-field">Largeur<input type="number" value={w} onChange={(e) => { setW(+e.target.value); if (keep && mode === 'image') setH(Math.round(+e.target.value / ratio)) }} /> px</label>
        <label className="psd-field">Hauteur<input type="number" value={h} onChange={(e) => { setH(+e.target.value); if (keep && mode === 'image') setW(Math.round(+e.target.value * ratio)) }} /> px</label>
      </div>
      {mode === 'image' && (
        <label className="pp-check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Conserver les proportions</label>
      )}
      <p className="psd-hint">{mode === 'image' ? 'Rééchantillonne toute l’image.' : 'Agrandit ou réduit la zone autour de l’image (ancrée au centre), sans la déformer.'}</p>
    </PsDialog>
  )
}

/* =========================================================
   Exporter sous…
   ========================================================= */

export function ExportDialog({ title, onClose }: { title: string; onClose: () => void }) {
  const { store } = useStudio()
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [quality, setQuality] = useState(90)
  const [scale, setScale] = useState(100)
  const [size, setSize] = useState<string>('')
  const s = store.state
  const build = async () => {
    const flat = flatten(s, format === 'jpeg' ? '#ffffff' : null)
    let out = flat
    if (scale !== 100) {
      out = document.createElement('canvas')
      out.width = Math.max(1, Math.round((s.width * scale) / 100))
      out.height = Math.max(1, Math.round((s.height * scale) / 100))
      const x = out.getContext('2d')!
      x.imageSmoothingQuality = 'high'
      x.drawImage(flat, 0, 0, out.width, out.height)
    }
    return canvasToBlob(out, `image/${format}`, format === 'jpeg' ? quality / 100 : undefined)
  }
  useEffect(() => {
    let alive = true
    build().then((b) => alive && setSize(b.size > 1e6 ? `${(b.size / 1e6).toFixed(1)} Mo` : `${Math.round(b.size / 1e3)} Ko`))
    return () => {
      alive = false
    }
  }, [format, quality, scale]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PsDialog
      title="Exporter sous"
      okLabel="Exporter"
      onCancel={onClose}
      onOk={async () => {
        const b = await build()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = `${(title || 'image').replace(/[\\/:*?"<>|]+/g, '')}.${format === 'jpeg' ? 'jpg' : 'png'}`
        a.click()
        onClose()
      }}
    >
      <label className="psd-field">
        Format
        <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}>
          <option value="png">PNG (transparence conservée)</option>
          <option value="jpeg">JPEG (plus léger, fond blanc)</option>
        </select>
      </label>
      {format === 'jpeg' && <Slider label="Qualité" min={10} max={100} value={quality} onChange={setQuality} unit="%" />}
      <Slider label="Échelle" min={10} max={400} value={scale} onChange={setScale} unit="%" />
      <p className="psd-hint">
        {Math.round((s.width * scale) / 100)} × {Math.round((s.height * scale) / 100)} px {size && `· environ ${size}`}
      </p>
    </PsDialog>
  )
}

/* =========================================================
   Aide : fonctions disponibles (honnêtement) et raccourcis
   ========================================================= */

export function FeaturesDialog({ onClose }: { onClose: () => void }) {
  return (
    <PsDialog title="Fonctions disponibles dans le studio Minion" onCancel={onClose} width={640}>
      <div className="psd-scroll">
        <p className="psd-hint" style={{ marginTop: 0 }}>
          Le studio reprend la disposition et les raccourcis de Photoshop pour t’entraîner aux vrais gestes. Ce n’est pas Photoshop : voici exactement ce qui fonctionne aujourd’hui.
        </p>
        <h4>Disponible</h4>
        <ul>
          <li>Documents aux dimensions libres, formats prédéfinis, import d’images (Fichier › Ouvrir, ou glisser une image).</li>
          <li>Calques de pixels, de texte, de forme et groupes ; opacité ; 16 modes de fusion ; masquer, verrouiller, renommer, réordonner, dupliquer, fusionner, aplatir.</li>
          <li>Masques de fusion (peindre en noir / blanc, depuis une sélection, activer / désactiver).</li>
          <li>Sélections : rectangle, ellipse, lasso, lasso polygonal, baguette magique ; ajouter (Maj), soustraire (Alt), intersection ; contour progressif ; intervertir ; sélection depuis un calque (Ctrl + clic sur la vignette).</li>
          <li>Pinceau, crayon, gomme (taille, dureté, opacité, flux), pot de peinture, dégradé linéaire et radial, pipette.</li>
          <li>Texte rééditable (police, corps, couleur, gras, italique, alignement, interligne).</li>
          <li>Formes vectorielles rééditables : rectangle (arrondi), ellipse, polygone, trait ; plume et sélection directe (calques de forme).</li>
          <li>Déplacement (calque ou pixels sélectionnés), transformation manuelle (échelle, rotation), symétrie, recadrage, taille de l’image et de la zone de travail.</li>
          <li>Réglages : Niveaux, Courbes, Teinte/Saturation, Luminosité/Contraste, Seuil, Désaturation, Négatif.</li>
          <li>Filtres : Flou gaussien, Netteté, Ajout de bruit.</li>
          <li>Historique (30 étapes), annuler / rétablir, projet rééditable enregistré automatiquement, export PNG et JPEG.</li>
          <li>Nuancier partagé avec les moodboards de Minion.</li>
        </ul>
        <h4>Pas (encore) disponible</h4>
        <ul>
          <li>Ouverture / enregistrement de fichiers .PSD, profils colorimétriques, CMJN, 16 bits.</li>
          <li>Calques de réglage non destructifs, styles de calque (ombre portée…), objets dynamiques.</li>
          <li>Sélection rapide et sélection d’objet par IA, remplissage génératif, tampon, correcteur, outils de retouche.</li>
          <li>Déformation (perspective, torsion), texte sur tracé, pinceaux personnalisés et pression du stylet.</li>
        </ul>
      </div>
    </PsDialog>
  )
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['V', 'Déplacement'], ['M (Maj+M)', 'Rectangle / Ellipse de sélection'], ['L (Maj+L)', 'Lasso / Lasso polygonal'], ['W', 'Baguette magique'],
    ['C', 'Recadrage'], ['I', 'Pipette'], ['B (Maj+B)', 'Pinceau / Crayon'], ['E', 'Gomme'], ['G (Maj+G)', 'Dégradé / Pot de peinture'],
    ['P', 'Plume'], ['T', 'Texte'], ['A', 'Sélection directe'], ['U (Maj+U)', 'Rectangle / Ellipse / Polygone / Trait'], ['H', 'Main'], ['Z', 'Zoom'],
    ['Espace', 'Main temporaire'], ['[  ]', 'Taille de la forme'], ['Maj+[  ]', 'Dureté'], ['1 … 0', 'Opacité de l’outil (ou du calque avec V)'],
    ['D', 'Couleurs par défaut'], ['X', 'Permuter les couleurs'], ['Ctrl+Z / Ctrl+Maj+Z', 'Annuler / Rétablir'], ['Ctrl+T', 'Transformation manuelle'],
    ['Ctrl+J', 'Dupliquer le calque / Calque par copier'], ['Ctrl+Maj+N', 'Nouveau calque'], ['Ctrl+G', 'Grouper'], ['Ctrl+E', 'Fusionner avec le calque inférieur'],
    ['Ctrl+[  /  Ctrl+]', 'Reculer / Avancer le calque'], ['Ctrl+A / Ctrl+D', 'Tout sélectionner / Désélectionner'], ['Ctrl+Maj+I', 'Intervertir la sélection'],
    ['Suppr', 'Effacer la sélection'], ['Alt+Retour arrière', 'Remplir avec le premier plan'], ['Ctrl+Retour arrière', 'Remplir avec l’arrière-plan'],
    ['Ctrl+L / Ctrl+M / Ctrl+U', 'Niveaux / Courbes / Teinte-Saturation'], ['Ctrl+I', 'Négatif'], ['Ctrl+Maj+U', 'Désaturation'],
    ['Ctrl+0 / Ctrl+1', 'Taille écran / 100 %'], ['Ctrl++ / Ctrl+−', 'Zoom avant / arrière'], ['Alt + molette', 'Zoom'],
    ['Ctrl+S', 'Enregistrer'], ['Ctrl+Alt+Maj+W', 'Exporter sous'], ['Ctrl+N / Ctrl+O', 'Nouveau / Ouvrir'], ['Tab', 'Masquer les panneaux'], ['F', 'Plein écran'],
  ]
  return (
    <PsDialog title="Raccourcis clavier" onCancel={onClose} width={560}>
      <p className="psd-hint" style={{ marginTop: 0 }}>Dans un navigateur, Ctrl+T, Ctrl+N, Ctrl+Maj+N et Ctrl+W sont réservés au navigateur (Ctrl+Maj+N ouvrirait une fenêtre privée). Passe en plein écran (touche F) : ils fonctionnent alors comme dans Photoshop. Les menus restent toujours disponibles.</p>
      <div className="psd-scroll psd-keys">
        {rows.map(([k, l]) => (
          <div key={k}>
            <kbd>{k}</kbd>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </PsDialog>
  )
}
