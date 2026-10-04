import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../../db/db'
import { pickFiles } from '../../db/assets'
import { LinkPicker } from '../../components/Linked'
import { link } from '../../db/links'
import { saveAsset } from '../../db/assets'
import { DEFAULT_UI, StudioCtx, useStudio, type UIState } from './context'
import { StudioStore, activeLayer, deserialize, serialize, useStore } from './store'
import { actions, editableRaster, insertAbove, layerCorners, needsRasterize, replaceLayer } from './actions'
import { applyOp, blobToCanvas, canvasToBlob, cloneCanvas, ctx2d, flatten, makeCanvas, newRaster, ops, rasterize } from './engine'
import { CanvasView, type TransformSession } from './CanvasView'
import { ColorPanel, HistoryPanel, LayersPanel, PropertiesPanel, SwatchesPanel } from './Panels'
import { AdjustDialog, ExportDialog, FeaturesDialog, PsDialog, ShortcutsDialog, SizeDialog, type AdjustKind } from './Dialogs'
import { TOOL_GROUPS, ToolIcon, toolDef, type ToolId } from './tools'
import type { GraphicDoc, RasterLayer, SDocState } from './types'
import './studio.css'

export function StudioPage() {
  const { id } = useParams()
  const [rec, setRec] = useState<GraphicDoc | null | undefined>(undefined)
  const [store, setStore] = useState<StudioStore | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await db.graphics.get(id!)
      if (!alive) return
      setRec(r ?? null)
      if (r) {
        const s = await deserialize(r.data)
        if (alive) setStore(new StudioStore(s, 'Ouvrir'))
        db.graphics.update(r.id, { openedAt: Date.now() })
      }
    })()
    return () => {
      alive = false
    }
  }, [id])
  if (rec === null) return <div className="ps ps-empty">Ce document n’existe plus.</div>
  if (!rec || !store) return <div className="ps ps-empty">Ouverture…</div>
  return <Workspace key={rec.id} rec={rec} store={store} />
}

function Workspace({ rec, store }: { rec: GraphicDoc; store: StudioStore }) {
  const navigate = useNavigate()
  const [ui, setUiState] = useState<UIState>(() => loadUi())
  const setUi = useCallback((p: Partial<UIState> | ((u: UIState) => Partial<UIState>)) => setUiState((u) => ({ ...u, ...(typeof p === 'function' ? p(u) : p) })), [])
  const doc = useStore(store)
  const [title, setTitle] = useState(rec.title)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved')
  const [transform, setTransform] = useState<TransformSession | null>(null)
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [dialog, setDialog] = useState<ReactNode>(null)
  const [rasterAsk, setRasterAsk] = useState<((v: boolean) => void) | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [linking, setLinking] = useState<false | 'project' | 'moodboard'>(false)
  const clipboard = useRef<HTMLCanvasElement | null>(null)
  const viewportSize = useRef({ w: 1000, h: 700 })
  const act = activeLayer(doc)

  const notify = useCallback((t: string) => {
    setToast(t)
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2600)
  }, [])
  const confirmRasterize = useCallback(() => new Promise<boolean>((res) => setRasterAsk(() => res)), [])

  useEffect(() => saveUi(ui), [ui])

  /* ---------- zoom initial : taille écran ---------- */
  const fit = useCallback(() => {
    const el = document.querySelector('.sv') as HTMLElement | null
    if (!el) return
    const w = el.clientWidth
    const h = el.clientHeight
    viewportSize.current = { w, h }
    const s = store.state
    const zoom = Math.min(1, (w - 60) / s.width, (h - 60) / s.height)
    setUi({ zoom, panX: (w - s.width * zoom) / 2, panY: (h - s.height * zoom) / 2 })
  }, [store, setUi])
  const actual = () => {
    const el = document.querySelector('.sv') as HTMLElement | null
    if (!el) return
    const s = store.state
    setUi({ zoom: 1, panX: (el.clientWidth - s.width) / 2, panY: (el.clientHeight - s.height) / 2 })
  }
  useEffect(() => {
    const t = window.setTimeout(fit, 30)
    return () => window.clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const zoomBy = (f: number) => {
    const { w, h } = viewportSize.current
    setUi((u) => {
      const zoom = Math.min(32, Math.max(0.05, u.zoom * f))
      const k = zoom / u.zoom
      return { zoom, panX: w / 2 - (w / 2 - u.panX) * k, panY: h / 2 - (h / 2 - u.panY) * k }
    })
  }

  /* ---------- enregistrement automatique (projet rééditable) ---------- */
  const save = useCallback(async () => {
    setSaveState('saving')
    try {
      const s = store.state
      const data = await serialize(s)
      const flat = flatten(s, '#ffffff')
      const k = Math.min(1, 480 / Math.max(s.width, s.height))
      const th = makeCanvas(s.width * k, s.height * k)
      ctx2d(th).drawImage(flat, 0, 0, th.width, th.height)
      const thumb = await canvasToBlob(th, 'image/jpeg', 0.85)
      await db.graphics.update(rec.id, { data, thumb, width: s.width, height: s.height, title, updatedAt: Date.now() })
      store.dirty = false
      setSaveState('saved')
    } catch (e) {
      console.error(e)
      setSaveState('dirty')
      notify('L’enregistrement a échoué. Réessaie avec Ctrl+S.')
    }
  }, [store, rec.id, title, notify])
  useEffect(() => {
    if (!store.dirty) return
    setSaveState('dirty')
    const t = window.setTimeout(save, 1500)
    return () => window.clearTimeout(t)
  }, [doc, save, store.dirty])
  useEffect(() => {
    db.graphics.update(rec.id, { title })
  }, [title, rec.id])

  /* ---------- transformation / recadrage ---------- */
  const startTransform = () => {
    const s = store.state
    const l = activeLayer(s)
    if (!l || l.kind === 'group') return notify('Choisis un calque à transformer.')
    if (l.locked) return notify('Ce calque est verrouillé.')
    const { local } = layerCorners(l, s)
    setTransform({ layerId: l.id, orig: l.matrix, local })
  }
  const commitTransform = () => {
    if (!transform) return
    const s = store.state
    const l = s.layers.find((x) => x.id === transform.layerId)
    setTransform(null)
    if (!l) return
    const changed = l.matrix.some((v, i) => Math.abs(v - transform.orig[i]) > 1e-6)
    if (!changed) return
    store.replace(replaceLayer(s, { ...l, matrix: transform.orig } as typeof l))
    store.commit('Transformation manuelle', replaceLayer(store.state, l))
  }
  const cancelTransform = () => {
    if (!transform) return
    const s = store.state
    const l = s.layers.find((x) => x.id === transform.layerId)
    if (l) store.replace(replaceLayer(s, { ...l, matrix: transform.orig } as typeof l))
    setTransform(null)
  }
  useEffect(() => {
    if (ui.tool === 'crop' && !crop) setCrop({ x: 0, y: 0, w: doc.width, h: doc.height })
    if (ui.tool !== 'crop' && crop) setCrop(null)
  }, [ui.tool]) // eslint-disable-line react-hooks/exhaustive-deps
  const commitCrop = () => {
    if (!crop) return
    actions.cropTo(store, crop)
    setCrop(null)
    setUi({ tool: 'move' })
    window.setTimeout(fit, 30)
  }

  /* ---------- réglages immédiats ---------- */
  const quickOp = async (name: string, op: ReturnType<typeof ops.invert>) => {
    if (needsRasterize(store.state) && !(await confirmRasterize())) return
    const r = editableRaster(store.state)
    if (!r) return notify('Choisis un calque de pixels.')
    store.commit(name, replaceLayer(r.state, { ...r.layer, canvas: applyOp(r.layer.canvas, op, r.state.selection) }))
  }
  const adjust = (k: AdjustKind) => setDialog(<AdjustDialog kind={k} onClose={() => setDialog(null)} />)

  /* ---------- import / copier-coller ---------- */
  const addImageLayer = async (file: Blob, name: string) => {
    const c = await blobToCanvas(file)
    const s = store.state
    // ajustée à la zone de travail si plus grande, centrée
    const k = Math.min(1, s.width / c.width, s.height / c.height)
    const l: RasterLayer = { ...newRaster(c.width, c.height, name), canvas: c, matrix: [k, 0, 0, k, (s.width - c.width * k) / 2, (s.height - c.height * k) / 2] }
    store.commit('Importer', insertAbove(s, l))
  }
  const copy = (merged = false) => {
    const s = store.state
    const l = activeLayer(s)
    if (!l || l.kind === 'group') return
    const src = merged ? flatten(s) : rasterize(l, s).canvas
    const c = cloneCanvas(src)
    if (s.selection) {
      const x = ctx2d(c)
      x.globalCompositeOperation = 'destination-in'
      x.drawImage(s.selection, 0, 0)
    }
    clipboard.current = c
    canvasToBlob(c).then((b) => navigator.clipboard?.write?.([new ClipboardItem({ 'image/png': b })]).catch(() => {}))
    notify('Copié')
  }
  const paste = () => {
    const c = clipboard.current
    if (!c) return
    const s = store.state
    const l: RasterLayer = { ...newRaster(s.width, s.height, 'Calque collé'), canvas: cloneCanvas(c) }
    store.commit('Coller', insertAbove({ ...s, selection: null }, l))
    setUi({ tool: 'move' })
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'))
      if (f) {
        e.preventDefault()
        addImageLayer(f, 'Image collée')
      } else if (clipboard.current) paste()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  /* ---------- envoyer vers Minion ---------- */
  const sendToMoodboard = async (moodboardId: string) => {
    const flat = flatten(store.state, null)
    const blob = await canvasToBlob(flat)
    const imageId = await saveAsset(new File([blob], `${title}.png`, { type: 'image/png' }))
    const m = await db.moodboards.get(moodboardId)
    if (!m) return
    const w = 360
    const h = (w * flat.height) / flat.width
    const maxZ = m.items.reduce((a, i) => Math.max(a, i.z), 0)
    await db.moodboards.update(m.id, { items: [...m.items, { id: crypto.randomUUID(), kind: 'image', imageId, x: 40, y: 40, w, h, rotation: 0, z: maxZ + 1 }], updatedAt: Date.now() })
    notify(`Image ajoutée au moodboard « ${m.title || 'Sans titre'} »`)
  }

  /* ---------- outils ---------- */
  const selectTool = (key: string, cycle: boolean) => {
    const group = TOOL_GROUPS.find((g) => g[0].key === key)
    if (!group) return
    setUi((u) => {
      const cur = group.findIndex((t) => t.id === u.tool)
      if (cur >= 0 && cycle) return { tool: group[(cur + 1) % group.length].id }
      if (cur >= 0) return {}
      const last = lastInGroup.current[key]
      return { tool: last && group.some((t) => t.id === last) ? last : group[0].id }
    })
  }
  const lastInGroup = useRef<Record<string, ToolId>>({})
  useEffect(() => {
    lastInGroup.current[toolDef(ui.tool).key] = ui.tool
    if (transform && ui.tool !== 'move') commitTransform()
  }, [ui.tool]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- raccourcis clavier (Photoshop, Windows) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || dialog || rasterAsk) return
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const run = (f: () => void) => {
        e.preventDefault()
        f()
      }
      if (transform) {
        if (e.key === 'Enter') return run(commitTransform)
        if (e.key === 'Escape') return run(cancelTransform)
      }
      if (crop) {
        if (e.key === 'Enter') return run(commitCrop)
        if (e.key === 'Escape') return run(() => { setCrop(null); setUi({ tool: 'move' }) })
      }
      if (ctrl) {
        if (k === 'z' && e.shiftKey) return run(() => store.redo())
        if (k === 'z' && e.altKey) return run(() => store.undo())
        if (k === 'z') return run(() => store.undo())
        if (k === 'y') return run(() => store.redo())
        if (k === 's') return run(save)
        if (k === 'w' && e.altKey && e.shiftKey) return run(() => setDialog(<ExportDialog title={title} onClose={() => setDialog(null)} />))
        if (k === 'n' && e.shiftKey) return run(() => actions.newLayer(store))
        if (k === 'n') return run(() => navigate('/studio?nouveau=1'))
        if (k === 'o') return run(openAsDoc)
        if (k === 't') return run(startTransform)
        if (k === 'j') return run(() => actions.duplicate(store))
        if (k === 'g' && e.shiftKey) return run(() => actions.ungroup(store))
        if (k === 'g') return run(() => actions.group(store))
        if (k === 'e' && e.shiftKey) return run(() => actions.flattenImage(store))
        if (k === 'e') return run(() => actions.mergeDown(store))
        if (e.key === '[' || e.code === 'BracketLeft') return run(() => actions.move(store, -1))
        if (e.key === ']' || e.code === 'BracketRight') return run(() => actions.move(store, 1))
        if (k === 'a') return run(() => actions.selectAll(store))
        if (k === 'd') return run(() => actions.deselect(store))
        if (k === 'i' && e.shiftKey) return run(() => actions.invertSel(store))
        if (k === 'i' && e.altKey) return run(() => setDialog(<SizeDialog mode="image" onClose={() => setDialog(null)} />))
        if (k === 'c' && e.altKey) return run(() => setDialog(<SizeDialog mode="canvas" onClose={() => setDialog(null)} />))
        if (k === 'i') return run(() => quickOp('Négatif', ops.invert()))
        if (k === 'u' && e.shiftKey) return run(() => quickOp('Désaturation', ops.desaturate()))
        if (k === 'u') return run(() => adjust('huesat'))
        if (k === 'l') return run(() => adjust('levels'))
        if (k === 'm') return run(() => adjust('curves'))
        if (k === 'c' && e.shiftKey) return run(() => copy(true))
        if (k === 'c') return run(() => copy())
        if (k === 'x') return run(() => { copy(); actions.clear(store) })
        if (k === '0') return run(fit)
        if (k === '1') return run(actual)
        if (e.key === '+' || e.key === '=') return run(() => zoomBy(1.25))
        if (e.key === '-') return run(() => zoomBy(1 / 1.25))
        if (e.key === 'Backspace') return run(() => actions.fill(store, ui.bg))
        return
      }
      if (e.altKey && e.key === 'Backspace') return run(() => actions.fill(store, ui.fg))
      if (e.key === 'Delete' || e.key === 'Backspace') return run(() => (store.state.selection ? actions.clear(store) : actions.remove(store)))
      if (e.key === 'Tab') return run(() => setUi((u) => ({ panelsHidden: !u.panelsHidden })))
      if (k === 'f' && !e.altKey && !e.shiftKey) return run(toggleFullscreen)
      if (k === 'x') return run(() => setUi((u) => ({ fg: u.bg, bg: u.fg })))
      if (k === 'd') return run(() => setUi({ fg: '#000000', bg: '#ffffff' }))
      if (e.key === '[' || e.key === ']' || e.code === 'BracketLeft' || e.code === 'BracketRight') {
        const up = e.key === ']' || e.code === 'BracketRight'
        return run(() =>
          setUi((u) => {
            const which = u.tool === 'eraser' ? 'eraser' : 'brush'
            const b = u[which]
            if (e.shiftKey) return { [which]: { ...b, hardness: Math.min(1, Math.max(0, b.hardness + (up ? 0.25 : -0.25))) } }
            const step = b.size < 10 ? 1 : b.size < 50 ? 5 : b.size < 100 ? 10 : 25
            return { [which]: { ...b, size: Math.min(2500, Math.max(1, b.size + (up ? step : -step))) } }
          }),
        )
      }
      if (/^[0-9]$/.test(e.key)) {
        const v = e.key === '0' ? 1 : +e.key / 10
        if (ui.tool === 'move' && act) return run(() => store.updateLayer('Opacité', act.id, { opacity: v }))
        if (ui.tool === 'brush' || ui.tool === 'pencil') return run(() => setUi((u) => ({ brush: { ...u.brush, opacity: v } })))
        if (ui.tool === 'eraser') return run(() => setUi((u) => ({ eraser: { ...u.eraser, opacity: v } })))
        return
      }
      const key = e.key.toUpperCase()
      if ('VMLWCIBEGPTAUHZ'.includes(key) && key.length === 1 && !e.altKey) return run(() => selectTool(key, e.shiftKey))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ---------- ouvrir une image comme nouveau document ---------- */
  const openAsDoc = async () => {
    const [f] = await pickFiles('image/*')
    if (!f) return
    const id = await createDocFromImage(f)
    navigate(`/studio/${id}`)
  }

  /* ---------- menus ---------- */
  type Item = { label: string; keys?: string; run?: () => void; disabled?: boolean; sep?: boolean }
  const M = (label: string, run: () => void, keys?: string, disabled = false): Item => ({ label, run, keys, disabled })
  const SEP: Item = { label: '', sep: true }
  const hasSel = !!doc.selection
  const menus: Record<string, Item[]> = {
    Fichier: [
      M('Nouveau…', () => navigate('/studio?nouveau=1'), 'Ctrl+N'),
      M('Ouvrir une image…', openAsDoc, 'Ctrl+O'),
      M('Importer une image (calque)…', async () => { const files = await pickFiles('image/*', true); for (const f of files) await addImageLayer(f, f.name.replace(/\.[^.]+$/, '')) }),
      SEP,
      M('Enregistrer', save, 'Ctrl+S'),
      M('Exporter sous…', () => setDialog(<ExportDialog title={title} onClose={() => setDialog(null)} />), 'Alt+Maj+Ctrl+W'),
      SEP,
      M('Envoyer vers un moodboard…', () => setLinking('moodboard')),
      M('Relier à un projet…', () => setLinking('project')),
      SEP,
      M('Fermer', () => save().then(() => navigate('/studio'))),
    ],
    Édition: [
      M(`Annuler ${store.steps[store.index]?.name ?? ''}`, () => store.undo(), 'Ctrl+Z', store.index === 0),
      M('Rétablir', () => store.redo(), 'Maj+Ctrl+Z', store.index >= store.steps.length - 1),
      SEP,
      M('Couper', () => { copy(); actions.clear(store) }, 'Ctrl+X', !hasSel),
      M('Copier', () => copy(), 'Ctrl+C'),
      M('Copier avec fusion', () => copy(true), 'Maj+Ctrl+C'),
      M('Coller', paste, 'Ctrl+V', !clipboard.current),
      M('Effacer', () => actions.clear(store), 'Suppr', !hasSel),
      SEP,
      M('Remplir avec le premier plan', () => actions.fill(store, ui.fg), 'Alt+Retour'),
      M('Remplir avec l’arrière-plan', () => actions.fill(store, ui.bg), 'Ctrl+Retour'),
      SEP,
      M('Transformation manuelle', startTransform, 'Ctrl+T'),
      M('Symétrie horizontale (calque)', () => actions.flip(store, 'h', false)),
      M('Symétrie verticale (calque)', () => actions.flip(store, 'v', false)),
    ],
    Image: [
      M('Réglages › Luminosité/Contraste…', () => adjust('brightness')),
      M('Réglages › Niveaux…', () => adjust('levels'), 'Ctrl+L'),
      M('Réglages › Courbes…', () => adjust('curves'), 'Ctrl+M'),
      M('Réglages › Teinte/Saturation…', () => adjust('huesat'), 'Ctrl+U'),
      M('Réglages › Désaturation', () => quickOp('Désaturation', ops.desaturate()), 'Maj+Ctrl+U'),
      M('Réglages › Négatif', () => quickOp('Négatif', ops.invert()), 'Ctrl+I'),
      M('Réglages › Seuil…', () => adjust('threshold')),
      SEP,
      M('Taille de l’image…', () => setDialog(<SizeDialog mode="image" onClose={() => setDialog(null)} />), 'Alt+Ctrl+I'),
      M('Taille de la zone de travail…', () => setDialog(<SizeDialog mode="canvas" onClose={() => setDialog(null)} />), 'Alt+Ctrl+C'),
      M('Symétrie horizontale de la zone de travail', () => actions.flip(store, 'h', true)),
      M('Symétrie verticale de la zone de travail', () => actions.flip(store, 'v', true)),
      M('Recadrer selon la sélection', () => {
        const s = store.state
        if (!s.selection) return
        import('./engine').then(({ contentBounds }) => {
          const b = contentBounds(s.selection!)
          if (b) actions.cropTo(store, b)
          window.setTimeout(fit, 30)
        })
      }, undefined, !hasSel),
    ],
    Calque: [
      M('Nouveau calque', () => actions.newLayer(store), 'Maj+Ctrl+N'),
      M(hasSel ? 'Calque par copier' : 'Dupliquer le calque', () => actions.duplicate(store), 'Ctrl+J'),
      M('Supprimer le calque', () => actions.remove(store)),
      SEP,
      M('Grouper les calques', () => actions.group(store), 'Ctrl+G'),
      M('Dissocier les calques', () => actions.ungroup(store), 'Maj+Ctrl+G', act?.kind !== 'group'),
      SEP,
      M('Masque de fusion › Tout faire apparaître', () => actions.addMask(store, false), undefined, !act || !!act.mask),
      M('Masque de fusion › Faire apparaître la sélection', () => actions.addMask(store, true), undefined, !act || !!act.mask || !hasSel),
      M('Masque de fusion › Supprimer', () => actions.removeMask(store), undefined, !act?.mask),
      SEP,
      M('Pixelliser', () => actions.rasterizeActive(store), undefined, !act || act.kind === 'raster' || act.kind === 'group'),
      M('Disposition › Avancer', () => actions.move(store, 1), 'Ctrl+]'),
      M('Disposition › Reculer', () => actions.move(store, -1), 'Ctrl+['),
      SEP,
      M('Fusionner avec le calque inférieur', () => actions.mergeDown(store), 'Ctrl+E'),
      M('Aplatir l’image', () => actions.flattenImage(store)),
    ],
    Sélection: [
      M('Tout sélectionner', () => actions.selectAll(store), 'Ctrl+A'),
      M('Désélectionner', () => actions.deselect(store), 'Ctrl+D', !hasSel),
      M('Intervertir', () => actions.invertSel(store), 'Maj+Ctrl+I'),
      SEP,
      M(`Contour progressif : ${ui.feather} px…`, () => setDialog(<FeatherDialog value={ui.feather} onClose={(v) => { if (v != null) setUi({ feather: v }); setDialog(null) }} />)),
    ],
    Filtre: [
      M('Flou › Flou gaussien…', () => adjust('blur')),
      M('Renforcement › Netteté…', () => adjust('sharpen')),
      M('Bruit › Ajout de bruit…', () => adjust('noise')),
    ],
    Affichage: [
      M('Zoom avant', () => zoomBy(1.25), 'Ctrl++'),
      M('Zoom arrière', () => zoomBy(1 / 1.25), 'Ctrl+−'),
      M('Taille écran', fit, 'Ctrl+0'),
      M('100 %', actual, 'Ctrl+1'),
      SEP,
      M(ui.panelsHidden ? 'Afficher les panneaux' : 'Masquer les panneaux', () => setUi((u) => ({ panelsHidden: !u.panelsHidden })), 'Tab'),
      M(document.fullscreenElement ? 'Quitter le plein écran' : 'Mode plein écran (Ctrl+T, Ctrl+N… actifs)', toggleFullscreen, 'F'),
    ],
    Aide: [
      M('Fonctions disponibles', () => setDialog(<FeaturesDialog onClose={() => setDialog(null)} />)),
      M('Raccourcis clavier', () => setDialog(<ShortcutsDialog onClose={() => setDialog(null)} />)),
      M('S’entraîner à la plume (atelier plume)', () => navigate('/plume')),
    ],
  }

  const ctx = useMemo(() => ({ store, ui, setUi, confirmRasterize, notify }), [store, ui, setUi, confirmRasterize, notify])

  return (
    <StudioCtx.Provider value={ctx}>
      <div className="ps studio" onClick={() => menu && setMenu(null)}>
        {/* ---- barre de menus ---- */}
        <header className="ps-menubar">
          <button className="ps-logo" title="Retour aux documents" onClick={() => save().then(() => navigate('/studio'))}>
            Mi
          </button>
          {Object.keys(menus).map((m) => (
            <div key={m} className="ps-menu-wrap">
              <button
                className={`ps-menu ${menu === m ? 'on' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setMenu(menu === m ? null : m)
                }}
                onMouseEnter={() => menu && setMenu(m)}
              >
                {m}
              </button>
              {menu === m && (
                <div className="ps-dropdown" onClick={(e) => e.stopPropagation()}>
                  {menus[m].map((it, i) =>
                    it.sep ? (
                      <div key={i} className="ps-dd-sep" />
                    ) : (
                      <button
                        key={i}
                        className="ps-dd-item"
                        disabled={it.disabled}
                        onClick={() => {
                          setMenu(null)
                          it.run?.()
                        }}
                      >
                        <span>{it.label}</span>
                        {it.keys && <span className="ps-dd-keys">{it.keys}</span>}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
          <span className="spacer" />
          <span className={`ps-save ${saveState}`}>{saveState === 'saved' ? '✓ Enregistré' : saveState === 'saving' ? 'Enregistrement…' : 'Modifications non enregistrées'}</span>
        </header>

        {/* ---- barre d'options ---- */}
        <OptionsBar transform={!!transform} onCommitTransform={commitTransform} onCancelTransform={cancelTransform} crop={!!crop} onCommitCrop={commitCrop} onCancelCrop={() => { setCrop(null); setUi({ tool: 'move' }) }} />

        <div className="ps-body">
          <Toolbar />
          <div className="ps-center">
            <div className="ps-tabs">
              <div className="ps-tab on">
                <input className="ps-tab-title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                <span className="ps-tab-info">
                  @ {Math.round(ui.zoom * 100)} % ({act?.name ?? '—'}{doc.editMask ? ', masque' : ''}, RVB/8)
                </span>
              </div>
            </div>
            <div
              className="ps-canvas-area"
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault()
                for (const f of Array.from(e.dataTransfer.files).filter((x) => x.type.startsWith('image/'))) await addImageLayer(f, f.name.replace(/\.[^.]+$/, ''))
              }}
            >
              <CanvasView transform={transform} setTransform={setTransform} crop={crop} setCrop={setCrop} />
            </div>
            <div className="ps-status">
              <span>{Math.round(ui.zoom * 100)} %</span>
              <span>{doc.width} × {doc.height} px</span>
              <span>{toolDef(ui.tool).label.replace('Outil ', '')}</span>
              {doc.selection && <span>Sélection active</span>}
            </div>
          </div>
          {!ui.panelsHidden && (
            <aside className="ps-panels">
              <PanelGroup tabs={{ Couleur: <ColorPanel />, Nuancier: <SwatchesPanel /> }} />
              <PanelGroup tabs={{ Propriétés: <PropertiesPanel /> }} />
              <PanelGroup tabs={{ Calques: <LayersPanel />, Historique: <HistoryPanel /> }} grow />
            </aside>
          )}
        </div>

        {dialog}
        {rasterAsk && (
          <PsDialog
            title="Pixelliser le calque ?"
            okLabel="Pixelliser"
            onCancel={() => {
              rasterAsk(false)
              setRasterAsk(null)
            }}
            onOk={() => {
              rasterAsk(true)
              setRasterAsk(null)
            }}
          >
            <p>Ce calque de texte ou de forme doit être pixellisé avant de poursuivre. Son contenu ne sera plus modifiable comme texte ou forme.</p>
            <p className="psd-hint">Comme dans Photoshop. Astuce : crée plutôt un nouveau calque (Ctrl+Maj+N) pour peindre par-dessus.</p>
          </PsDialog>
        )}
        {toast && <div className="ps-toast">{toast}</div>}
        <LinkPicker
          open={!!linking}
          onClose={() => setLinking(false)}
          types={linking === 'moodboard' ? ['moodboard'] : ['project']}
          title={linking === 'moodboard' ? 'Envoyer vers quel moodboard ?' : 'Relier à quel projet ?'}
          onPick={async (e) => {
            if (linking === 'moodboard') await sendToMoodboard(e.id)
            else {
              const flat = flatten(store.state, '#ffffff')
              const blob = await canvasToBlob(flat, 'image/jpeg', 0.9)
              const imageId = await saveAsset(new File([blob], `${title}.jpg`, { type: 'image/jpeg' }))
              const p = await db.projects.get(e.id)
              if (p) await db.projects.update(p.id, { results: [...(p.results ?? []), imageId], updatedAt: Date.now() })
              await link('project', e.id, 'moodboard', rec.id).catch(() => {})
              notify(`Création ajoutée au projet « ${e.title} »`)
            }
          }}
        />
      </div>
    </StudioCtx.Provider>
  )
}

function FeatherDialog({ value, onClose }: { value: number; onClose: (v: number | null) => void }) {
  const [v, setV] = useState(value)
  return (
    <PsDialog title="Contour progressif" onCancel={() => onClose(null)} onOk={() => onClose(v)}>
      <label className="psd-field">Rayon<input type="number" min={0} max={250} value={v} onChange={(e) => setV(Math.max(0, +e.target.value))} /> px</label>
      <p className="psd-hint">S’applique aux prochaines sélections (rectangle, ellipse, lasso).</p>
    </PsDialog>
  )
}

/* =========================================================
   Barre d'outils (avec groupes déroulants)
   ========================================================= */

function Toolbar() {
  const { ui, setUi } = useStudio()
  const [fly, setFly] = useState<number | null>(null)
  const last = useRef<Record<number, ToolId>>({})
  return (
    <nav className="ps-tools" onMouseLeave={() => setFly(null)}>
      {TOOL_GROUPS.map((g, gi) => {
        const activeHere = g.find((t) => t.id === ui.tool)
        if (activeHere) last.current[gi] = activeHere.id
        const shown = activeHere ?? g.find((t) => t.id === last.current[gi]) ?? g[0]
        return (
          <div key={gi} className="ps-tool-wrap">
            <button
              className={`ps-tool ${activeHere ? 'on' : ''}`}
              title={`${shown.label} (${shown.key})${g.length > 1 ? ' · clic droit : autres outils' : ''}`}
              onClick={() => setUi({ tool: shown.id })}
              onContextMenu={(e) => {
                e.preventDefault()
                if (g.length > 1) setFly(gi)
              }}
              onPointerDown={(e) => {
                if (g.length < 2) return
                const t = window.setTimeout(() => setFly(gi), 450)
                const up = () => {
                  window.clearTimeout(t)
                  window.removeEventListener('pointerup', up)
                }
                window.addEventListener('pointerup', up)
                void e
              }}
            >
              <ToolIcon id={shown.id} />
              {g.length > 1 && <span className="ps-tool-more" />}
            </button>
            {fly === gi && (
              <div className="ps-fly">
                {g.map((t) => (
                  <button key={t.id} className={`ps-fly-item ${t.id === ui.tool ? 'on' : ''}`} onClick={() => { setUi({ tool: t.id }); setFly(null) }}>
                    <ToolIcon id={t.id} size={16} />
                    <span>{t.label}</span>
                    <kbd>{t.key}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <div className="ps-colors">
        <button className="ps-color fg" style={{ background: ui.fg }} title="Couleur de premier plan">
          <input type="color" value={ui.fg} onChange={(e) => setUi({ fg: e.target.value })} />
        </button>
        <button className="ps-color bg" style={{ background: ui.bg }} title="Couleur d’arrière-plan">
          <input type="color" value={ui.bg} onChange={(e) => setUi({ bg: e.target.value })} />
        </button>
        <button className="ps-color-swap" title="Permuter (X)" onClick={() => setUi({ fg: ui.bg, bg: ui.fg })}>⇆</button>
        <button className="ps-color-default" title="Couleurs par défaut (D)" onClick={() => setUi({ fg: '#000000', bg: '#ffffff' })}>■</button>
      </div>
    </nav>
  )
}

/* =========================================================
   Barre d'options (selon l'outil)
   ========================================================= */

function OptionsBar(p: { transform: boolean; onCommitTransform: () => void; onCancelTransform: () => void; crop: boolean; onCommitCrop: () => void; onCancelCrop: () => void }) {
  const { ui, setUi, store } = useStudio()
  const t = ui.tool
  const num = (v: number, set: (v: number) => void, min: number, max: number, suffix = '') => (
    <span className="ps-opt-num">
      <input type="number" min={min} max={max} value={Math.round(v)} onChange={(e) => set(Math.min(max, Math.max(min, +e.target.value)))} onKeyDown={(e) => e.stopPropagation()} />
      {suffix}
    </span>
  )
  let content: ReactNode = null
  if (p.transform) {
    content = (
      <>
        <span className="ps-opt-help">Coins : échelle (Maj : libre, Alt : depuis le centre) · hors du cadre : rotation (Maj : 15°) · intérieur : déplacer</span>
        <span className="spacer" />
        <button className="ps-opt-btn" onClick={p.onCancelTransform} title="Annuler (Échap)">✕</button>
        <button className="ps-opt-btn ok" onClick={p.onCommitTransform} title="Valider (Entrée)">✓</button>
      </>
    )
  } else if (p.crop) {
    content = (
      <>
        <span className="ps-opt-help">Ajuste le cadre puis valide · Entrée pour recadrer · Échap pour annuler</span>
        <span className="spacer" />
        <button className="ps-opt-btn" onClick={p.onCancelCrop}>✕</button>
        <button className="ps-opt-btn ok" onClick={p.onCommitCrop}>✓</button>
      </>
    )
  } else if (t === 'brush' || t === 'pencil' || t === 'eraser') {
    const which = t === 'eraser' ? 'eraser' : 'brush'
    const b = ui[which] as UIState['brush']
    const set = (patch: Partial<UIState['brush']>) => setUi({ [which]: { ...b, ...patch } } as Partial<UIState>)
    content = (
      <>
        <label>Taille {num(b.size, (v) => set({ size: v }), 1, 2500, ' px')}</label>
        {t !== 'pencil' && <label>Dureté {num(b.hardness * 100, (v) => set({ hardness: v / 100 }), 0, 100, ' %')}</label>}
        <label>Opacité {num(b.opacity * 100, (v) => set({ opacity: v / 100 }), 1, 100, ' %')}</label>
        {t === 'brush' && <label>Flux {num(b.flow * 100, (v) => set({ flow: v / 100 }), 1, 100, ' %')}</label>}
        {store.state.editMask && <span className="ps-opt-tag">Peinture dans le masque : blanc = révéler, noir = masquer</span>}
      </>
    )
  } else if (t === 'marquee-rect' || t === 'marquee-ellipse' || t === 'lasso' || t === 'lasso-poly') {
    content = (
      <>
        <span className="ps-opt-help">Maj : ajouter · Alt : soustraire · Maj+Alt : intersection{t.startsWith('marquee') ? ' · Maj en tirant : carré / cercle' : t === 'lasso-poly' ? ' · double-clic ou clic sur le 1er point : fermer' : ''}</span>
        <label>Contour progressif {num(ui.feather, (v) => setUi({ feather: v }), 0, 250, ' px')}</label>
      </>
    )
  } else if (t === 'wand' || t === 'bucket') {
    content = (
      <>
        <label>Tolérance {num(ui.tolerance, (v) => setUi({ tolerance: v }), 0, 255)}</label>
        <label className="ps-opt-check"><input type="checkbox" checked={ui.contiguous} onChange={(e) => setUi({ contiguous: e.target.checked })} /> Pixels contigus</label>
        <label className="ps-opt-check"><input type="checkbox" checked={ui.sampleAll} onChange={(e) => setUi({ sampleAll: e.target.checked })} /> Échantillonner tous les calques</label>
      </>
    )
  } else if (t === 'gradient') {
    content = (
      <>
        <span className="ps-opt-grad" style={{ background: `linear-gradient(to right, ${ui.fg}, ${ui.bg})` }} />
        <div className="ps-seg">
          <button className={ui.gradient === 'linear' ? 'on' : ''} onClick={() => setUi({ gradient: 'linear' })}>Linéaire</button>
          <button className={ui.gradient === 'radial' ? 'on' : ''} onClick={() => setUi({ gradient: 'radial' })}>Radial</button>
        </div>
        <span className="ps-opt-help">Premier plan → arrière-plan · Maj : 45°</span>
      </>
    )
  } else if (t === 'text') {
    content = (
      <>
        <select value={ui.text.font} onChange={(e) => setUi({ text: { ...ui.text, font: e.target.value } })}>
          {['Inter Variable', 'Fraunces Variable', 'Caveat', 'Georgia', 'Arial', 'Times New Roman', 'Courier New', 'Segoe UI', 'Impact'].map((f) => (
            <option key={f} value={f}>{f.replace(' Variable', '')}</option>
          ))}
        </select>
        <label>{num(ui.text.size, (v) => setUi({ text: { ...ui.text, size: v } }), 4, 1000, ' px')}</label>
        <button className={`ps-opt-btn ${ui.text.bold ? 'on' : ''}`} onClick={() => setUi({ text: { ...ui.text, bold: !ui.text.bold } })}><b>G</b></button>
        <button className={`ps-opt-btn ${ui.text.italic ? 'on' : ''}`} onClick={() => setUi({ text: { ...ui.text, italic: !ui.text.italic } })}><i>I</i></button>
        <span className="ps-opt-help">Couleur = premier plan · clic pour écrire · Échap ou Ctrl+Entrée pour valider</span>
      </>
    )
  } else if (t === 'rect' || t === 'ellipse' || t === 'polygon' || t === 'line' || t === 'pen') {
    const s = ui.shape
    content = (
      <>
        <span className="ps-opt-label">Forme</span>
        <label className="ps-opt-check"><input type="checkbox" checked={!!s.fill} onChange={(e) => setUi({ shape: { ...s, fill: e.target.checked ? ui.fg : null } })} /> Fond</label>
        {s.fill && <input type="color" value={s.fill} onChange={(e) => setUi({ shape: { ...s, fill: e.target.value } })} />}
        <label className="ps-opt-check"><input type="checkbox" checked={!!s.stroke} onChange={(e) => setUi({ shape: { ...s, stroke: e.target.checked ? '#000000' : null } })} /> Contour</label>
        {s.stroke && <input type="color" value={s.stroke} onChange={(e) => setUi({ shape: { ...s, stroke: e.target.value } })} />}
        <label>{num(s.strokeWidth, (v) => setUi({ shape: { ...s, strokeWidth: v } }), 0, 200, ' px')}</label>
        {t === 'rect' && <label>Arrondi {num(s.radius, (v) => setUi({ shape: { ...s, radius: v } }), 0, 1000, ' px')}</label>}
        {t === 'polygon' && <label>Côtés {num(s.sides, (v) => setUi({ shape: { ...s, sides: v } }), 3, 30)}</label>}
        <span className="ps-opt-help">{t === 'pen' ? 'Clic : angle · clic-glisser : courbe · Ctrl : sélection directe · Alt : convertir' : 'Maj : proportions · Alt : depuis le centre'}</span>
      </>
    )
  } else if (t === 'move') {
    content = <span className="ps-opt-help">Glisser pour déplacer le calque (ou les pixels sélectionnés) · flèches : 1 px, Maj : 10 px · 1…0 : opacité du calque · Ctrl+T : transformer</span>
  } else if (t === 'direct') {
    content = <span className="ps-opt-help">Glisser un point ou une poignée du tracé de la forme active · Alt : poignée indépendante</span>
  } else if (t === 'eyedropper') {
    content = <span className="ps-opt-help">Clic : couleur de premier plan · Alt + clic : arrière-plan</span>
  } else if (t === 'zoom') {
    content = <span className="ps-opt-help">Clic : zoom avant · Alt + clic : zoom arrière · Alt + molette partout</span>
  } else if (t === 'hand') {
    content = <span className="ps-opt-help">Glisser pour se déplacer · Espace : main temporaire avec n’importe quel outil</span>
  } else if (t === 'crop') {
    content = <span className="ps-opt-help">Tire un cadre puis Entrée</span>
  }
  return (
    <div className="ps-options">
      <span className="ps-opt-tool">
        <ToolIcon id={t} size={16} />
      </span>
      <span className="ps-opt-sep" />
      {content}
    </div>
  )
}

function PanelGroup({ tabs, grow }: { tabs: Record<string, ReactNode>; grow?: boolean }) {
  const names = Object.keys(tabs)
  const [tab, setTab] = useState(names[0])
  const [open, setOpen] = useState(true)
  return (
    <section className={`ps-pgroup ${grow ? 'grow' : ''} ${open ? '' : 'closed'}`}>
      <div className="ps-ptabs">
        {names.map((n) => (
          <button key={n} className={`ps-ptab ${tab === n ? 'on' : ''}`} onClick={() => { setTab(n); setOpen(true) }}>
            {n}
          </button>
        ))}
        <span className="spacer" />
        <button className="ps-pcollapse" onClick={() => setOpen((o) => !o)} title={open ? 'Réduire' : 'Déplier'}>
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open && <div className="ps-pcontent">{tabs[tab]}</div>}
    </section>
  )
}


/**
 * Plein écran (touche F, comme les modes d'affichage de Photoshop).
 * En plein écran, le navigateur laisse l'application capter Ctrl+T, Ctrl+N, Ctrl+W…
 * (hors plein écran, ces raccourcis sont réservés au navigateur).
 */
async function toggleFullscreen() {
  const kb = (navigator as Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void } }).keyboard
  try {
    if (document.fullscreenElement) {
      kb?.unlock?.()
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
      await kb?.lock?.(['KeyT', 'KeyN', 'KeyW', 'KeyO', 'KeyJ', 'Escape'])
    }
  } catch {
    /* le navigateur peut refuser : sans conséquence */
  }
}

/* ---------- préférences d'interface conservées ---------- */
function loadUi(): UIState {
  try {
    const raw = localStorage.getItem('minion:studioUi')
    return raw ? { ...DEFAULT_UI, ...JSON.parse(raw), zoom: 1, panX: 0, panY: 0 } : DEFAULT_UI
  } catch {
    return DEFAULT_UI
  }
}
function saveUi(u: UIState) {
  try {
    const { zoom: _z, panX: _x, panY: _y, ...rest } = u
    localStorage.setItem('minion:studioUi', JSON.stringify(rest))
  } catch {
    /* rien */
  }
}

/* ---------- création de documents ---------- */
export async function createDoc(title: string, w: number, h: number, bg: string | null): Promise<string> {
  const base: SDocState = { width: w, height: h, layers: [], activeId: null, selection: null, editMask: false }
  const layer = newRaster(w, h, bg ? 'Arrière-plan' : 'Calque 1', bg ?? undefined)
  const s = { ...base, layers: [layer], activeId: layer.id }
  const id = crypto.randomUUID()
  const now = Date.now()
  await db.graphics.add({ id, createdAt: now, updatedAt: now, title, width: w, height: h, thumb: null, data: await serialize(s) })
  return id
}

export async function createDocFromImage(file: Blob & { name?: string }): Promise<string> {
  const c = await blobToCanvas(file)
  const layer: RasterLayer = { ...newRaster(c.width, c.height, 'Arrière-plan'), canvas: c }
  const s: SDocState = { width: c.width, height: c.height, layers: [layer], activeId: layer.id, selection: null, editMask: false }
  const id = crypto.randomUUID()
  const now = Date.now()
  await db.graphics.add({ id, createdAt: now, updatedAt: now, title: (file.name ?? 'Image').replace(/\.[^.]+$/, ''), width: c.width, height: c.height, thumb: null, data: await serialize(s) })
  return id
}

/** Depuis l'atelier plume : chaque tracé devient un calque de forme rééditable. */
export async function createDocFromPaths(title: string, w: number, h: number, paths: import('../pen/bezier').VPath[]): Promise<string> {
  const { newShape } = await import('./engine')
  const bg = newRaster(w, h, 'Arrière-plan', '#ffffff')
  const shapes = paths
    .filter((p) => p.anchors.length > 1)
    .map((p, i) => ({ ...newShape({ shape: 'path', path: p, fill: p.closed ? '#c98b8b' : null, stroke: '#2e2a26', strokeWidth: 3 }, 0, 0), name: `Tracé ${i + 1}` }))
  const layers = [bg, ...shapes]
  const s: SDocState = { width: w, height: h, layers, activeId: layers[layers.length - 1].id, selection: null, editMask: false }
  const id = crypto.randomUUID()
  const now = Date.now()
  await db.graphics.add({ id, createdAt: now, updatedAt: now, title, width: w, height: h, thumb: null, data: await serialize(s) })
  return id
}
