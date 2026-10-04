import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useStudio } from './context'
import { activeLayer, useStore } from './store'
import { actions, editableRaster, insertAbove, layerCorners, needsRasterize, replaceLayer } from './actions'
import {
  apply,
  cloneCanvas,
  colorRegion,
  combineSelection,
  ctx2d,
  drawLayerContent,
  flatten,
  hex,
  invert,
  makeCanvas,
  measureText,
  mul,
  newShape,
  newText,
  rasterize,
  renderDoc,
  selectionFromPath,
  selectionOutline,
  translate,
  type SelMode,
  type RenderOptions,
} from './engine'
import { PenCanvas } from '../pen/PenCanvas'
import type { VPath } from '../pen/bezier'
import type { Matrix, RasterLayer, SDocState, SLayer, ShapeLayer, TextLayer } from './types'

interface P {
  x: number
  y: number
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  | { kind: 'stroke'; layerId: string; last: P; target: 'pixels' | 'mask' }
  | { kind: 'marquee'; start: P; cur: P; mode: SelMode; ellipse: boolean }
  | { kind: 'lasso'; pts: P[]; mode: SelMode }
  | { kind: 'move-layer'; start: P; orig: Matrix; layerId: string; moved: boolean }
  | { kind: 'move-pixels'; start: P; cur: P; layerId: string; base: HTMLCanvasElement; floating: HTMLCanvasElement; sel: HTMLCanvasElement }
  | { kind: 'gradient'; start: P; cur: P }
  | { kind: 'shape'; start: P; cur: P }
  | { kind: 'crop'; handle: string; start: P; orig: Rect }
  | { kind: 'transform'; handle: string; start: P; orig: Matrix }

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TransformSession {
  layerId: string
  orig: Matrix
  local: Rect
}

export function CanvasView({ transform, setTransform, crop, setCrop }: {
  transform: TransformSession | null
  setTransform: (t: TransformSession | null) => void
  crop: Rect | null
  setCrop: (r: Rect | null) => void
}) {
  const { store, ui, setUi, confirmRasterize, notify } = useStudio()
  const doc = useStore(store)
  const viewport = useRef<HTMLDivElement>(null)
  const display = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const strokeCanvas = useRef<HTMLCanvasElement | null>(null)
  const lastPaint = useRef<P | null>(null)
  const [hover, setHover] = useState<P | null>(null)
  const [space, setSpace] = useState(false)
  const [poly, setPoly] = useState<{ pts: P[]; mode: SelMode } | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [, force] = useState(0)
  const raf = useRef(0)
  const z = ui.zoom
  const act = activeLayer(doc)
  const tool = space ? 'hand' : ui.tool

  /* ---------- coordonnées ---------- */
  const toDoc = (e: { clientX: number; clientY: number }): P => {
    const r = display.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * doc.width, y: ((e.clientY - r.top) / r.height) * doc.height }
  }

  /* ---------- rendu ---------- */
  const paint = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const c = display.current
      if (!c) return
      const s = store.state
      if (c.width !== s.width || c.height !== s.height) {
        c.width = s.width
        c.height = s.height
      }
      const d = drag.current
      let live: RenderOptions['live']
      if (d?.kind === 'stroke' && strokeCanvas.current) {
        const l = s.layers.find((x) => x.id === d.layerId)
        if (l) live = { id: l.id, draw: (t) => drawStrokePreview(t, l, strokeCanvas.current!, d.target, s, ui) }
      } else if (d?.kind === 'move-pixels') {
        live = { id: d.layerId, draw: (t) => { t.drawImage(d.base, 0, 0); t.drawImage(d.floating, d.cur.x - d.start.x, d.cur.y - d.start.y) } }
      } else if (d?.kind === 'gradient') {
        const r = editableRasterPreview(s)
        if (r) live = { id: r.id, draw: (t) => { t.drawImage(r.canvas, 0, 0); drawGradient(t, s, d.start, d.cur, ui) } }
      }
      renderDoc(c, s, { live })
      // aperçu d'une forme en cours de tracé
      if (d?.kind === 'shape') {
        const x = ctx2d(c)
        const tmp = shapeFromDrag(d.start, d.cur, ui, keys.current.shift, keys.current.alt)
        drawLayerContent(x, tmp)
      }
    })
  }, [store, ui])

  useEffect(paint, [doc, paint, transform])

  /* ---------- touches ---------- */
  const keys = useRef({ shift: false, alt: false, ctrl: false })
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space' && !editingText) {
        e.preventDefault()
        setSpace(true)
      }
      if (poly && e.key === 'Escape') setPoly(null)
      if (poly && e.key === 'Enter') closePoly()
      if (poly && e.key === 'Backspace') setPoly({ ...poly, pts: poly.pts.slice(0, -1) })
      // flèches : déplacement fin avec l'outil Déplacement
      if (ui.tool === 'move' && e.key.startsWith('Arrow') && act && !act.locked) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        store.updateLayer('Déplacer', act.id, { matrix: mul(translate(dx, dy), act.matrix) })
      }
    }
    const up = (e: KeyboardEvent) => {
      keys.current = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey }
      if (e.code === 'Space') setSpace(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  /* ---------- zoom molette (Alt ou Ctrl), défilement sinon ---------- */
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.altKey || e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top)
      } else setUi((u) => ({ panX: u.panX - (e.shiftKey ? e.deltaY : e.deltaX), panY: u.panY - (e.shiftKey ? 0 : e.deltaY) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const zoomAt = (f: number, vx: number, vy: number) => {
    setUi((u) => {
      const zoom = Math.min(32, Math.max(0.05, u.zoom * f))
      const k = zoom / u.zoom
      return { zoom, panX: vx - (vx - u.panX) * k, panY: vy - (vy - u.panY) * k }
    })
  }

  /* ---------- sélections ---------- */
  const selModeFrom = (e: { shiftKey: boolean; altKey: boolean }): SelMode => (e.shiftKey && e.altKey ? 'inter' : e.shiftKey && doc.selection ? 'add' : e.altKey && doc.selection ? 'sub' : 'new')
  const commitSelection = (shape: HTMLCanvasElement, mode: SelMode, name: string) => {
    const s = store.state
    store.commit(name, { ...s, selection: combineSelection(s.selection, shape, mode, s.width, s.height) })
  }
  const closePoly = () => {
    if (!poly || poly.pts.length < 3) return setPoly(null)
    const shape = selectionFromPath(doc.width, doc.height, (p) => {
      poly.pts.forEach((pt, i) => (i ? p.lineTo(pt.x, pt.y) : p.moveTo(pt.x, pt.y)))
      p.closePath()
    }, ui.feather)
    commitSelection(shape, poly.mode, 'Lasso polygonal')
    setPoly(null)
  }

  /* ---------- pinceau ---------- */
  const brushOpts = ui.tool === 'eraser' ? { ...ui.eraser, flow: 1 } : ui.brush
  const dab = (c: CanvasRenderingContext2D, p: P, color: string) => {
    const r = brushOpts.size / 2
    if (ui.tool === 'pencil') {
      c.fillStyle = color
      c.fillRect(Math.round(p.x - r), Math.round(p.y - r), Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r * 2)))
      return
    }
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
    const [cr, cg, cb] = hexToRgb(color)
    const a = brushOpts.flow
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`)
    g.addColorStop(Math.min(0.99, brushOpts.hardness), `rgba(${cr},${cg},${cb},${a})`)
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    c.fillStyle = g
    c.beginPath()
    c.arc(p.x, p.y, r, 0, Math.PI * 2)
    c.fill()
  }
  const strokeTo = (from: P, to: P) => {
    const c = ctx2d(strokeCanvas.current!)
    const step = Math.max(1, brushOpts.size * (ui.tool === 'pencil' ? 0.25 : 0.12))
    const d = Math.hypot(to.x - from.x, to.y - from.y)
    const n = Math.max(1, Math.ceil(d / step))
    for (let i = 1; i <= n; i++) dab(c, { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }, '#000000')
  }

  const startStroke = async (p: P, e: RPointerEvent) => {
    let s = store.state
    const l = activeLayer(s)
    if (!l) return notify('Choisis d’abord un calque.')
    if (l.locked) return notify('Ce calque est verrouillé.')
    if (l.kind === 'group') return notify('Choisis un calque, pas un groupe.')
    const target = s.editMask && l.mask ? 'mask' : 'pixels'
    if (target === 'pixels') {
      if (needsRasterize(s)) {
        if (!(await confirmRasterize())) return
      }
      const r = editableRaster(s)
      if (!r) return
      if (r.state !== s) {
        store.commit('Pixelliser le calque', r.state)
        s = r.state
      }
    }
    strokeCanvas.current = makeCanvas(s.width, s.height)
    const from = e.shiftKey && lastPaint.current ? lastPaint.current : p
    drag.current = { kind: 'stroke', layerId: l.id, last: p, target }
    dab(ctx2d(strokeCanvas.current), from, '#000000')
    if (from !== p) strokeTo(from, p)
    paint()
  }

  const endStroke = (d: Extract<Drag, { kind: 'stroke' }>) => {
    const s = store.state
    const l = s.layers.find((x) => x.id === d.layerId)
    const stroke = strokeCanvas.current
    strokeCanvas.current = null
    lastPaint.current = d.last
    if (!l || !stroke) return
    const name = ui.tool === 'eraser' ? 'Gomme' : ui.tool === 'pencil' ? 'Crayon' : 'Pinceau'
    if (d.target === 'mask' && l.mask) {
      store.commit(name, replaceLayer(s, { ...l, mask: applyMaskStroke(l.mask, stroke, s, ui) } as SLayer))
    } else if (l.kind === 'raster') {
      const c = cloneCanvas(l.canvas)
      applyPixelStroke(ctx2d(c), stroke, s, ui)
      store.commit(name, replaceLayer(s, { ...l, canvas: c }))
    }
  }

  /* ---------- pointeur ---------- */
  const onDown = async (e: RPointerEvent) => {
    if (editingText) return
    if (e.button === 2) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = toDoc(e)
    const s = store.state

    if (tool === 'hand' || e.button === 1) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: ui.panX, py: ui.panY }
      return
    }
    if (transform) {
      drag.current = { kind: 'transform', handle: hitTransform(p) ?? 'rotate', start: p, orig: s.layers.find((l) => l.id === transform.layerId)!.matrix }
      return
    }
    switch (tool) {
      case 'zoom': {
        const r = viewport.current!.getBoundingClientRect()
        zoomAt(e.altKey ? 1 / 1.5 : 1.5, e.clientX - r.left, e.clientY - r.top)
        return
      }
      case 'brush':
      case 'pencil':
      case 'eraser':
        return startStroke(p, e)
      case 'marquee-rect':
      case 'marquee-ellipse':
        drag.current = { kind: 'marquee', start: p, cur: p, mode: selModeFrom(e), ellipse: tool === 'marquee-ellipse' }
        return
      case 'lasso':
        drag.current = { kind: 'lasso', pts: [p], mode: selModeFrom(e) }
        return
      case 'lasso-poly': {
        if (!poly) setPoly({ pts: [p], mode: selModeFrom(e) })
        else if (poly.pts.length > 2 && Math.hypot(p.x - poly.pts[0].x, p.y - poly.pts[0].y) < 8 / z) closePoly()
        else setPoly({ ...poly, pts: [...poly.pts, p] })
        return
      }
      case 'wand': {
        const src = ui.sampleAll ? flatten(s) : act && act.kind !== 'group' ? rasterize(act, s).canvas : flatten(s)
        commitSelection(colorRegion(src, p.x, p.y, ui.tolerance, ui.contiguous), selModeFrom(e), 'Baguette magique')
        return
      }
      case 'eyedropper': {
        const flat = flatten(s)
        const d = flat.getContext('2d', { willReadFrequently: true })!.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data
        const color = hex(d[0], d[1], d[2])
        setUi(e.altKey ? { bg: color } : { fg: color })
        return
      }
      case 'bucket': {
        if (needsRasterize(s) && !(await confirmRasterize())) return
        const r = editableRaster(store.state)
        if (!r) return notify('Choisis un calque pixel modifiable.')
        const region = colorRegion(ui.sampleAll ? flatten(r.state) : r.layer.canvas, p.x, p.y, ui.tolerance, ui.contiguous)
        if (r.state.selection) {
          const rc = ctx2d(region)
          rc.globalCompositeOperation = 'destination-in'
          rc.drawImage(r.state.selection, 0, 0)
        }
        const fill = makeCanvas(s.width, s.height)
        const fc = ctx2d(fill)
        fc.fillStyle = ui.fg
        fc.fillRect(0, 0, s.width, s.height)
        fc.globalCompositeOperation = 'destination-in'
        fc.drawImage(region, 0, 0)
        const c = cloneCanvas(r.layer.canvas)
        ctx2d(c).drawImage(fill, 0, 0)
        store.commit('Pot de peinture', replaceLayer(r.state, { ...r.layer, canvas: c }))
        return
      }
      case 'gradient': {
        if (s.editMask && act?.mask) {
          drag.current = { kind: 'gradient', start: p, cur: p }
          return
        }
        if (needsRasterize(s) && !(await confirmRasterize())) return
        const r = editableRaster(store.state)
        if (!r) return notify('Choisis un calque pixel modifiable.')
        if (r.state !== store.state) store.commit('Pixelliser le calque', r.state)
        drag.current = { kind: 'gradient', start: p, cur: p }
        return
      }
      case 'move': {
        if (!act || act.locked) return notify(act ? 'Ce calque est verrouillé.' : 'Aucun calque sélectionné.')
        if (s.selection && act.kind === 'raster') {
          const r = editableRaster(s)
          if (!r) return
          if (r.state !== s) store.commit('Pixelliser le calque', r.state)
          const floating = cloneCanvas(r.layer.canvas)
          const fc = ctx2d(floating)
          fc.globalCompositeOperation = 'destination-in'
          fc.drawImage(s.selection, 0, 0)
          const base = cloneCanvas(r.layer.canvas)
          const bc = ctx2d(base)
          bc.globalCompositeOperation = 'destination-out'
          bc.drawImage(s.selection, 0, 0)
          drag.current = { kind: 'move-pixels', start: p, cur: p, layerId: r.layer.id, base, floating, sel: s.selection }
          return
        }
        drag.current = { kind: 'move-layer', start: p, orig: act.matrix, layerId: act.id, moved: false }
        return
      }
      case 'crop': {
        const h = crop ? hitRect(crop, p) : null
        drag.current = { kind: 'crop', handle: h ?? 'new', start: p, orig: crop ?? { x: p.x, y: p.y, w: 0, h: 0 } }
        return
      }
      case 'text': {
        // clic sur un texte existant : on l'édite ; sinon nouveau calque de texte
        const hit = [...s.layers].reverse().find((l) => l.kind === 'text' && l.visible && insideLayer(l, p, s))
        if (hit) {
          store.replace({ ...s, activeId: hit.id })
          setEditingText(hit.id)
          return
        }
        const t = newText(p.x, p.y - ui.text.size * 0.6, { ...ui.text, color: ui.fg, text: '' })
        store.commit('Calque de texte', insertAbove(s, { ...t, name: 'Texte' }))
        setEditingText(t.id)
        return
      }
      case 'rect':
      case 'ellipse':
      case 'polygon':
      case 'line':
        drag.current = { kind: 'shape', start: p, cur: p }
        return
    }
  }

  const onMove = (e: RPointerEvent) => {
    const p = toDoc(e)
    setHover(p)
    const d = drag.current
    if (!d) return
    switch (d.kind) {
      case 'pan':
        setUi({ panX: d.px + e.clientX - d.sx, panY: d.py + e.clientY - d.sy })
        return
      case 'stroke':
        strokeTo(d.last, p)
        d.last = p
        paint()
        return
      case 'marquee':
      case 'gradient':
      case 'shape':
        d.cur = e.shiftKey && d.kind === 'gradient' ? snap45(d.start, p) : p
        force((n) => n + 1)
        paint()
        return
      case 'lasso':
        d.pts.push(p)
        force((n) => n + 1)
        return
      case 'move-layer': {
        let dx = p.x - d.start.x
        let dy = p.y - d.start.y
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0)
        d.moved = true
        store.replace(replaceLayer(store.state, { ...store.state.layers.find((l) => l.id === d.layerId)!, matrix: mul(translate(dx, dy), d.orig) } as SLayer))
        return
      }
      case 'move-pixels':
        d.cur = p
        paint()
        force((n) => n + 1)
        return
      case 'crop': {
        setCrop(dragRect(d.orig, d.handle, d.start, p, e.shiftKey))
        return
      }
      case 'transform': {
        const t = transform!
        const l = store.state.layers.find((x) => x.id === t.layerId)!
        store.replace(replaceLayer(store.state, { ...l, matrix: transformMatrix(t, d.orig, d.handle, d.start, p, e.shiftKey, e.altKey) } as SLayer))
        return
      }
    }
  }

  const onUp = (e: RPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const s = store.state
    switch (d.kind) {
      case 'stroke':
        return endStroke(d)
      case 'marquee': {
        const r = normRect(d.start, d.cur, e.shiftKey && d.mode === 'new', e.altKey && d.mode === 'new')
        if (r.w < 2 && r.h < 2) {
          if (d.mode === 'new') actions.deselect(store)
          return
        }
        const shape = selectionFromPath(s.width, s.height, (path) => (d.ellipse ? path.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2) : path.rect(r.x, r.y, r.w, r.h)), ui.feather)
        commitSelection(shape, d.mode, d.ellipse ? 'Ellipse de sélection' : 'Rectangle de sélection')
        force((n) => n + 1)
        return
      }
      case 'lasso': {
        if (d.pts.length < 3) return
        const shape = selectionFromPath(s.width, s.height, (path) => {
          d.pts.forEach((pt, i) => (i ? path.lineTo(pt.x, pt.y) : path.moveTo(pt.x, pt.y)))
          path.closePath()
        }, ui.feather)
        commitSelection(shape, d.mode, 'Lasso')
        force((n) => n + 1)
        return
      }
      case 'move-layer':
        if (d.moved) {
          const cur = store.state
          // remet l'état d'avant puis valide en une étape d'historique
          const moved = cur.layers.find((l) => l.id === d.layerId)!
          store.replace(replaceLayer(cur, { ...moved, matrix: d.orig } as SLayer))
          store.commit('Déplacer', replaceLayer(store.state, moved))
        }
        return
      case 'move-pixels': {
        const dx = d.cur.x - d.start.x
        const dy = d.cur.y - d.start.y
        const l = s.layers.find((x) => x.id === d.layerId) as RasterLayer
        const c = cloneCanvas(d.base)
        ctx2d(c).drawImage(d.floating, dx, dy)
        const sel = makeCanvas(s.width, s.height)
        ctx2d(sel).drawImage(d.sel, dx, dy)
        store.commit('Déplacer', { ...replaceLayer(s, { ...l, canvas: c }), selection: sel })
        return
      }
      case 'gradient': {
        if (Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y) < 2) return paint()
        const l = activeLayer(s)
        if (!l) return
        if (s.editMask && l.mask) {
          const g = makeCanvas(s.width, s.height)
          drawGradient(ctx2d(g), s, d.start, d.cur, ui, true)
          store.commit('Dégradé', replaceLayer(s, { ...l, mask: g } as SLayer))
          return
        }
        if (l.kind !== 'raster') return
        const c = cloneCanvas(l.canvas)
        drawGradient(ctx2d(c), s, d.start, d.cur, ui)
        store.commit('Dégradé', replaceLayer(s, { ...l, canvas: c }))
        return
      }
      case 'shape': {
        const shape = shapeFromDrag(d.start, d.cur, ui, e.shiftKey, e.altKey)
        if (Math.abs(shape.w) < 2 && Math.abs(shape.h) < 2) return paint()
        store.commit('Calque de forme', insertAbove(s, shape))
        return
      }
      case 'crop':
        if (crop && (crop.w < 2 || crop.h < 2)) setCrop(null)
        return
      case 'transform':
        return
    }
  }

  /* ---------- transformation : poignées ---------- */
  const tBox = useMemo(() => {
    if (!transform) return null
    const l = doc.layers.find((x) => x.id === transform.layerId)
    if (!l) return null
    const b = transform.local
    const m = l.matrix
    const pts = [apply(m, b.x, b.y), apply(m, b.x + b.w, b.y), apply(m, b.x + b.w, b.y + b.h), apply(m, b.x, b.y + b.h)]
    const mid = (a: P, c: P) => ({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 })
    return { pts, handles: { nw: pts[0], ne: pts[1], se: pts[2], sw: pts[3], n: mid(pts[0], pts[1]), e: mid(pts[1], pts[2]), s: mid(pts[2], pts[3]), w: mid(pts[3], pts[0]) } as Record<string, P> }
  }, [transform, doc])

  const hitTransform = (p: P) => {
    if (!tBox) return null
    for (const [k, h] of Object.entries(tBox.handles)) if (Math.hypot(h.x - p.x, h.y - p.y) < 9 / z) return k
    return pointInPoly(p, tBox.pts) ? 'move' : null
  }

  /* ---------- texte en cours d'édition ---------- */
  const textLayer = editingText ? (doc.layers.find((l) => l.id === editingText) as TextLayer | undefined) : undefined
  const finishText = () => {
    const s = store.state
    const l = s.layers.find((x) => x.id === editingText) as TextLayer | undefined
    setEditingText(null)
    if (!l) return
    if (!l.text.trim()) {
      store.replace({ ...s, layers: s.layers.filter((x) => x.id !== l.id), activeId: s.layers.filter((x) => x.id !== l.id).at(-1)?.id ?? null })
      return
    }
    store.commit('Modifier le texte', replaceLayer(s, { ...l, name: l.text.split('\n')[0].slice(0, 30) }))
  }

  /* ---------- plume (calques de forme vectoriels) ---------- */
  const penLayer = act && act.kind === 'shape' && act.shape === 'path' ? (act as ShapeLayer) : null
  const penActive = ui.tool === 'pen' || ui.tool === 'direct'
  const penValue: VPath = penLayer?.path ? toDocPath(penLayer) : { anchors: [], closed: false }
  // la plume garde son état quand c'est elle qui vient de créer le calque ; elle repart à zéro si on change de calque
  const penKey = useRef({ id: penLayer?.id ?? null, n: 0, created: null as string | null })
  if ((penLayer?.id ?? null) !== penKey.current.id) {
    if (!(penLayer && penLayer.id === penKey.current.created)) penKey.current.n++
    penKey.current.id = penLayer?.id ?? null
    penKey.current.created = null
  }
  const onPenChange = (v: VPath) => {
    const s = store.state
    const cur = activeLayer(s)
    if (cur && cur.kind === 'shape' && cur.shape === 'path') {
      store.replace(replaceLayer(s, { ...cur, path: fromDocPath(cur, v) } as SLayer))
    } else if (v.anchors.length) {
      const l = newShape({ shape: 'path', path: v, fill: ui.shape.fill, stroke: ui.shape.stroke ?? (ui.shape.fill ? null : ui.fg), strokeWidth: ui.shape.strokeWidth }, 0, 0)
      penKey.current.created = l.id
      store.commit('Plume', insertAbove(s, { ...l, name: 'Forme' }))
    }
  }

  /* ---------- fourmis de la sélection ---------- */
  const ants = useMemo(() => (doc.selection ? selectionOutline(doc.selection) : ''), [doc.selection])

  const d = drag.current
  const overlay = (
    <svg className="sv-overlay" viewBox={`0 0 ${doc.width} ${doc.height}`} preserveAspectRatio="none">
      {ants && (
        <g className="sv-ants" style={{ strokeWidth: 1 / z }}>
          <path d={ants} stroke="#fff" fill="none" />
          <path d={ants} stroke="#000" fill="none" strokeDasharray={`${4 / z} ${4 / z}`} className="sv-ants-dash" />
        </g>
      )}
      {d?.kind === 'marquee' && (() => {
        const r = normRect(d.start, d.cur, keys.current.shift && d.mode === 'new', keys.current.alt && d.mode === 'new')
        return d.ellipse ? <ellipse cx={r.x + r.w / 2} cy={r.y + r.h / 2} rx={r.w / 2} ry={r.h / 2} className="sv-marq" style={{ strokeWidth: 1 / z }} /> : <rect {...r} width={r.w} height={r.h} className="sv-marq" style={{ strokeWidth: 1 / z }} />
      })()}
      {d?.kind === 'lasso' && <polyline points={d.pts.map((p) => `${p.x},${p.y}`).join(' ')} className="sv-marq" style={{ strokeWidth: 1 / z }} />}
      {poly && <polyline points={[...poly.pts, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(' ')} className="sv-marq" style={{ strokeWidth: 1 / z }} />}
      {d?.kind === 'gradient' && <line x1={d.start.x} y1={d.start.y} x2={d.cur.x} y2={d.cur.y} stroke="#fff" strokeWidth={2 / z} style={{ filter: 'drop-shadow(0 0 1px #000)' }} />}
      {crop && (
        <g>
          <path d={`M0 0H${doc.width}V${doc.height}H0Z M${crop.x} ${crop.y}V${crop.y + crop.h}H${crop.x + crop.w}V${crop.y}Z`} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
          <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="none" stroke="#fff" strokeWidth={1.5 / z} />
          {[1, 2].map((k) => (
            <g key={k} stroke="rgba(255,255,255,0.5)" strokeWidth={1 / z}>
              <line x1={crop.x + (crop.w * k) / 3} x2={crop.x + (crop.w * k) / 3} y1={crop.y} y2={crop.y + crop.h} />
              <line y1={crop.y + (crop.h * k) / 3} y2={crop.y + (crop.h * k) / 3} x1={crop.x} x2={crop.x + crop.w} />
            </g>
          ))}
          {rectHandles(crop).map(([k, h]) => (
            <rect key={k} x={h.x - 5 / z} y={h.y - 5 / z} width={10 / z} height={10 / z} fill="#fff" stroke="#000" strokeWidth={1 / z} />
          ))}
        </g>
      )}
      {tBox && (
        <g>
          <polygon points={tBox.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#2f80ed" strokeWidth={1 / z} />
          {Object.entries(tBox.handles).map(([k, h]) => (
            <rect key={k} x={h.x - 4 / z} y={h.y - 4 / z} width={8 / z} height={8 / z} fill="#fff" stroke="#2f80ed" strokeWidth={1 / z} />
          ))}
        </g>
      )}
      {/* contour du pinceau */}
      {hover && ['brush', 'pencil', 'eraser'].includes(tool) && (
        <circle cx={hover.x} cy={hover.y} r={(ui.tool === 'eraser' ? ui.eraser.size : ui.brush.size) / 2} fill="none" stroke="#fff" strokeWidth={1 / z} style={{ filter: 'drop-shadow(0 0 1px #000)' }} />
      )}
    </svg>
  )

  const cursor = tool === 'hand' ? (drag.current?.kind === 'pan' ? 'grabbing' : 'grab') : tool === 'zoom' ? (keys.current.alt ? 'zoom-out' : 'zoom-in') : ['brush', 'pencil', 'eraser'].includes(tool) ? 'none' : tool === 'move' ? 'move' : tool === 'text' ? 'text' : tool === 'eyedropper' ? 'copy' : transform ? 'default' : 'crosshair'

  return (
    <div ref={viewport} className="sv" onContextMenu={(e) => e.preventDefault()}>
      <div className="sv-stage" style={{ transform: `translate(${ui.panX}px, ${ui.panY}px)` }}>
        <div className="sv-doc" style={{ width: doc.width * z, height: doc.height * z }}>
          <canvas ref={display} className="sv-canvas" style={{ imageRendering: z >= 2 ? 'pixelated' : 'auto' }} />
          {overlay}
          {/* surface d'interaction */}
          {!(penActive && !space) && (
            <div
              className="sv-hit"
              style={{ cursor }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => setHover(null)}
              onDoubleClick={() => {
                if (poly) closePoly()
              }}
            />
          )}
          {penActive && !space && !transform && (
            <PenCanvas
              key={penKey.current.n}
              width={doc.width}
              height={doc.height}
              value={penValue}
              onChange={onPenChange}
              tool={ui.tool === 'direct' ? 'direct' : 'pen'}
              setTool={(t) => setUi({ tool: t })}
              background={null}
              undoKeys={false}
              toolKeys={false}
              className="sv-pen"
              onCommit={(v) => {
                const cur = activeLayer(store.state)
                if (cur && cur.kind === 'shape' && cur.shape === 'path') store.commit('Plume', replaceLayer(store.state, { ...cur, path: fromDocPath(cur, v) } as SLayer))
              }}
            />
          )}
          {textLayer && <TextEditor layer={textLayer} zoom={z} onDone={finishText} />}
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   Aides
   ========================================================= */

function TextEditor({ layer, zoom, onDone }: { layer: TextLayer; zoom: number; onDone: () => void }) {
  const { store } = useStudio()
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const m = layer.matrix
  const mt = measureText(layer)
  const scale = Math.hypot(m[0], m[1])
  return (
    <textarea
      ref={ref}
      className="sv-text-edit"
      value={layer.text}
      placeholder="Écris ici…"
      style={{
        left: (m[4] + (layer.align === 'center' ? -mt.w / 2 : layer.align === 'right' ? -mt.w : 0) * scale) * zoom,
        top: m[5] * zoom,
        font: `${layer.italic ? 'italic ' : ''}${layer.bold ? 700 : 400} ${layer.size * scale * zoom}px "${layer.font}", sans-serif`,
        lineHeight: layer.lineHeight,
        color: layer.color,
        width: Math.max(80, mt.w * scale * zoom + 40),
        height: Math.max(layer.size, mt.h) * scale * zoom + 10,
        textAlign: layer.align,
      }}
      onChange={(e) => store.replace(replaceLayer(store.state, { ...layer, text: e.target.value }))}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) onDone()
      }}
      onBlur={onDone}
    />
  )
}

function editableRasterPreview(s: SDocState) {
  const l = activeLayer(s)
  return l && l.kind === 'raster' ? l : null
}

/** Aperçu d'un trait en cours : opacité appliquée au trait entier, découpé par la sélection. */
function drawStrokePreview(t: CanvasRenderingContext2D, l: SLayer, stroke: HTMLCanvasElement, target: 'pixels' | 'mask', s: SDocState, ui: import('./context').UIState) {
  if (target === 'mask' && l.mask) {
    const m = applyMaskStroke(l.mask, stroke, s, ui)
    drawLayerContent(t, l)
    t.globalCompositeOperation = 'destination-in'
    t.drawImage(m, 0, 0)
    t.globalCompositeOperation = 'source-over'
    return
  }
  if (l.kind !== 'raster') return drawLayerContent(t, l)
  t.drawImage(l.canvas, 0, 0)
  applyPixelStroke(t, stroke, s, ui)
}


function applyPixelStroke(t: CanvasRenderingContext2D, stroke: HTMLCanvasElement, s: SDocState, ui: import('./context').UIState) {
  const eraser = ui.tool === 'eraser'
  const colored = makeCanvas(s.width, s.height)
  const cc = ctx2d(colored)
  cc.drawImage(stroke, 0, 0)
  cc.globalCompositeOperation = 'source-in'
  cc.fillStyle = ui.fg
  cc.fillRect(0, 0, s.width, s.height)
  if (s.selection) {
    cc.globalCompositeOperation = 'destination-in'
    cc.drawImage(s.selection, 0, 0)
  }
  t.save()
  t.globalAlpha = eraser ? ui.eraser.opacity : ui.brush.opacity
  t.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
  t.drawImage(colored, 0, 0)
  t.restore()
}

/** Peindre dans un masque : blanc révèle, noir masque, gris = partiel. */
function applyMaskStroke(mask: HTMLCanvasElement, stroke: HTMLCanvasElement, s: SDocState, ui: import('./context').UIState) {
  const out = cloneCanvas(mask)
  const c = ctx2d(out)
  const st = cloneCanvas(stroke)
  if (s.selection) {
    const sc = ctx2d(st)
    sc.globalCompositeOperation = 'destination-in'
    sc.drawImage(s.selection, 0, 0)
  }
  const [r, g, b] = hexToRgb(ui.fg)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const reveal = ui.tool !== 'eraser' ? lum >= 0.5 : true
  c.globalAlpha = (ui.tool === 'eraser' ? ui.eraser.opacity : ui.brush.opacity) * (reveal ? (ui.tool === 'eraser' ? 1 : lum) : 1 - lum)
  c.globalCompositeOperation = reveal ? 'source-over' : 'destination-out'
  c.drawImage(st, 0, 0)
  return out
}

function drawGradient(t: CanvasRenderingContext2D, s: SDocState, a: P, b: P, ui: import('./context').UIState, forMask = false) {
  const g = ui.gradient === 'radial' ? t.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y)) : t.createLinearGradient(a.x, a.y, b.x, b.y)
  if (forMask) {
    // masque : du premier plan (selon sa luminosité) vers l'arrière-plan
    const lum = (h: string) => {
      const [r, gg, bb] = hexToRgb(h)
      return (0.299 * r + 0.587 * gg + 0.114 * bb) / 255
    }
    g.addColorStop(0, `rgba(0,0,0,${lum(ui.fg)})`)
    g.addColorStop(1, `rgba(0,0,0,${lum(ui.bg)})`)
  } else {
    g.addColorStop(0, ui.fg)
    g.addColorStop(1, ui.bg)
  }
  const tmp = makeCanvas(s.width, s.height)
  const tc = ctx2d(tmp)
  tc.fillStyle = g
  tc.fillRect(0, 0, s.width, s.height)
  if (s.selection) {
    tc.globalCompositeOperation = 'destination-in'
    tc.drawImage(s.selection, 0, 0)
  }
  if (forMask) t.clearRect(0, 0, s.width, s.height)
  t.drawImage(tmp, 0, 0)
}

function shapeFromDrag(a: P, b: P, ui: import('./context').UIState, shift: boolean, alt: boolean): ShapeLayer {
  const kind = ui.tool === 'rect' ? 'rect' : ui.tool === 'ellipse' ? 'ellipse' : ui.tool === 'polygon' ? 'polygon' : 'line'
  let w = b.x - a.x
  let h = b.y - a.y
  if (kind === 'line') {
    if (shift) {
      const s = snap45(a, b)
      w = s.x - a.x
      h = s.y - a.y
    }
    return newShape({ shape: 'line', w, h, fill: null, stroke: ui.shape.stroke ?? ui.fg, strokeWidth: ui.shape.strokeWidth }, a.x, a.y)
  }
  if (shift) {
    const m = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w || 1) * m
    h = Math.sign(h || 1) * m
  }
  let x = a.x
  let y = a.y
  if (alt) {
    x = a.x - w
    y = a.y - h
    w *= 2
    h *= 2
  }
  const nx = Math.min(x, x + w)
  const ny = Math.min(y, y + h)
  return newShape({ shape: kind, w: Math.abs(w), h: Math.abs(h), fill: ui.shape.fill, stroke: ui.shape.stroke, strokeWidth: ui.shape.strokeWidth, radius: ui.shape.radius, sides: ui.shape.sides }, nx, ny)
}

function snap45(a: P, b: P): P {
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d }
}

function normRect(a: P, b: P, square: boolean, fromCenter: boolean): Rect {
  let w = b.x - a.x
  let h = b.y - a.y
  if (square) {
    const m = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w || 1) * m
    h = Math.sign(h || 1) * m
  }
  let x = a.x
  let y = a.y
  if (fromCenter) {
    x -= w
    y -= h
    w *= 2
    h *= 2
  }
  return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) }
}

const rectHandles = (r: Rect): [string, P][] => [
  ['nw', { x: r.x, y: r.y }],
  ['n', { x: r.x + r.w / 2, y: r.y }],
  ['ne', { x: r.x + r.w, y: r.y }],
  ['e', { x: r.x + r.w, y: r.y + r.h / 2 }],
  ['se', { x: r.x + r.w, y: r.y + r.h }],
  ['s', { x: r.x + r.w / 2, y: r.y + r.h }],
  ['sw', { x: r.x, y: r.y + r.h }],
  ['w', { x: r.x, y: r.y + r.h / 2 }],
]

function hitRect(r: Rect, p: P) {
  for (const [k, h] of rectHandles(r)) if (Math.hypot(h.x - p.x, h.y - p.y) < 12) return k
  if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return 'move'
  return null
}

function dragRect(o: Rect, handle: string, start: P, p: P, shift: boolean): Rect {
  const dx = p.x - start.x
  const dy = p.y - start.y
  if (handle === 'new') return normRect(start, p, shift, false)
  if (handle === 'move') return { ...o, x: o.x + dx, y: o.y + dy }
  let { x, y, w, h } = o
  if (handle.includes('w')) {
    x += dx
    w -= dx
  }
  if (handle.includes('e')) w += dx
  if (handle.includes('n')) {
    y += dy
    h -= dy
  }
  if (handle.includes('s')) h += dy
  return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) }
}

/** Nouvelle matrice selon la poignée tirée (échelle, rotation, déplacement). */
function transformMatrix(t: TransformSession, orig: Matrix, handle: string, start: P, p: P, shift: boolean, alt: boolean): Matrix {
  const b = t.local
  if (handle === 'move') return mul(translate(p.x - start.x, p.y - start.y), orig)
  const center = apply(orig, b.x + b.w / 2, b.y + b.h / 2)
  if (handle === 'rotate') {
    const a0 = Math.atan2(start.y - center.y, start.x - center.x)
    let a1 = Math.atan2(p.y - center.y, p.x - center.x)
    let da = a1 - a0
    if (shift) da = Math.round(da / (Math.PI / 12)) * (Math.PI / 12)
    const c = Math.cos(da)
    const s = Math.sin(da)
    return mul(mul(translate(center.x, center.y), [c, s, -s, c, 0, 0]), mul(translate(-center.x, -center.y), orig))
  }
  // échelle dans le repère local du calque
  const inv = invert(orig)
  const lp = apply(inv, p.x, p.y)
  const hx = handle.includes('w') ? b.x : handle.includes('e') ? b.x + b.w : null
  const hy = handle.includes('n') ? b.y : handle.includes('s') ? b.y + b.h : null
  const ax = alt ? b.x + b.w / 2 : hx === b.x ? b.x + b.w : b.x
  const ay = alt ? b.y + b.h / 2 : hy === b.y ? b.y + b.h : b.y
  let sx = hx != null ? (lp.x - ax) / (hx - ax || 1) : 1
  let sy = hy != null ? (lp.y - ay) / (hy - ay || 1) : 1
  // comme Photoshop récent : proportions conservées aux coins, Maj pour les libérer
  const corner = hx != null && hy != null
  if (corner && !shift) {
    const k = Math.abs(sx) > Math.abs(sy) ? sx : sy
    sx = k
    sy = k
  }
  const local: Matrix = mul(mul(translate(ax, ay), [sx, 0, 0, sy, 0, 0]), translate(-ax, -ay))
  return mul(orig, local)
}

const pointInPoly = (p: P, pts: P[]) => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if (pts[i].y > p.y !== pts[j].y > p.y && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside
  }
  return inside
}

function insideLayer(l: SLayer, p: P, s: SDocState) {
  const { corners } = layerCorners(l, s)
  return pointInPoly(p, corners)
}

function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '')
  return [parseInt(m.slice(0, 2), 16) || 0, parseInt(m.slice(2, 4), 16) || 0, parseInt(m.slice(4, 6), 16) || 0]
}

/** Le tracé d'un calque de forme, exprimé dans le document (pour la plume). */
function toDocPath(l: ShapeLayer): VPath {
  const m = l.matrix
  const tp = (pt: P) => apply(m, pt.x, pt.y)
  return { closed: l.path!.closed, anchors: l.path!.anchors.map((a) => ({ ...tp(a), hIn: a.hIn && tp(a.hIn), hOut: a.hOut && tp(a.hOut) })) }
}
function fromDocPath(l: ShapeLayer, v: VPath): VPath {
  const inv = invert(l.matrix)
  const tp = (pt: P) => apply(inv, pt.x, pt.y)
  return { closed: v.closed, anchors: v.anchors.map((a) => ({ ...tp(a), hIn: a.hIn && tp(a.hIn), hOut: a.hOut && tp(a.hOut) })) }
}
