import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db, uid } from '../../db/db'
import { saveAsset, pickFiles } from '../../db/assets'
import type { MoodItem, Moodboard } from '../../db/types'
import { Icon } from '../../components/Icon'
import { LinkedItems } from '../../components/Linked'
import { Menu, Modal, SaveStatus, useAutosave, useUI } from '../../components/ui'
import { MoodItemView } from './MoodItemView'
import { BACKGROUNDS } from './templates'
import { exportBoardPNG, printBoard } from './exportBoard'
import './moodboard.css'

export function MoodboardEditorPage() {
  const { id } = useParams()
  const b = useLiveQuery(() => db.moodboards.get(id!), [id])
  if (b === undefined) return null
  if (!b)
    return (
      <div className="page narrow empty">
        <span className="hand">Introuvable</span>Ce moodboard n’existe plus.
      </div>
    )
  return <Editor key={b.id} initial={b} />
}

type Drag =
  | { kind: 'move'; start: P; orig: MoodItem[]; moved: boolean }
  | { kind: 'resize'; sx: number; sy: number; start: P; orig: MoodItem }
  | { kind: 'rotate'; orig: MoodItem; startAngle: number }
  | { kind: 'pan'; startClient: P; origView: View }
  | { kind: 'marquee'; start: P; cur: P }

interface P {
  x: number
  y: number
}
interface View {
  x: number
  y: number
  zoom: number
}

const SNAP_PX = 6

function Editor({ initial }: { initial: Moodboard }) {
  const navigate = useNavigate()
  const { toast } = useUI()
  const [board, setBoard] = useState({ title: initial.title, background: initial.background, items: initial.items })
  const [sel, setSel] = useState<string[]>([])
  const [view, setView] = useState<View>({ x: -60, y: -40, zoom: 0.8 })
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] })
  const [panelOpen, setPanelOpen] = useState(true)
  const [linkUrl, setLinkUrl] = useState<{ url: string; label: string } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const [, force] = useState(0)
  const [size, setSize] = useState({ w: 1000, h: 700 })
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1000, h: el.clientHeight || 700 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const past = useRef<MoodItem[][]>([])
  const future = useRef<MoodItem[][]>([])

  const state = useAutosave(board, (v) => db.moodboards.update(initial.id, { ...v, updatedAt: Date.now() }))
  useEffect(() => {
    db.moodboards.update(initial.id, { openedAt: Date.now() })
  }, [initial.id])

  const items = board.items
  const selected = items.filter((i) => sel.includes(i.id))
  const one = selected.length === 1 ? selected[0] : null

  /* ---------- historique ---------- */
  const commit = useCallback((next: MoodItem[], prev = items) => {
    past.current.push(prev)
    if (past.current.length > 100) past.current.shift()
    future.current = []
    setBoard((b) => ({ ...b, items: next }))
  }, [items])
  const live = (next: MoodItem[]) => setBoard((b) => ({ ...b, items: next }))
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(items)
    setBoard((b) => ({ ...b, items: prev }))
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(items)
    setBoard((b) => ({ ...b, items: next }))
  }
  const update = (id: string, p: Partial<MoodItem>) => commit(items.map((i) => (i.id === id ? { ...i, ...p } : i)))

  /* ---------- coordonnées ---------- */
  const toWorld = (clientX: number, clientY: number): P => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: view.x + (clientX - r.left) / view.zoom, y: view.y + (clientY - r.top) / view.zoom }
  }
  const viewportCenter = (): P => {
    const r = svgRef.current?.getBoundingClientRect()
    return r ? { x: view.x + r.width / 2 / view.zoom, y: view.y + r.height / 2 / view.zoom } : { x: 400, y: 300 }
  }
  const maxZ = () => items.reduce((m, i) => Math.max(m, i.z), 0)

  /* ---------- ajout ---------- */
  const add = (partial: Omit<MoodItem, 'id' | 'z' | 'rotation' | 'x' | 'y'> & Partial<Pick<MoodItem, 'x' | 'y'>>) => {
    const c = viewportCenter()
    const it: MoodItem = { rotation: 0, ...partial, id: uid(), z: maxZ() + 1, x: partial.x ?? c.x - partial.w / 2, y: partial.y ?? c.y - partial.h / 2 }
    commit([...items, it])
    setSel([it.id])
    return it
  }
  const addImages = async (files: File[], at?: P) => {
    let offset = 0
    const created: MoodItem[] = []
    for (const f of files.filter((f) => f.type.startsWith('image/'))) {
      const id = await saveAsset(f)
      const bmp = await createImageBitmap(f).catch(() => null)
      const ratio = bmp ? bmp.height / bmp.width : 0.75
      const w = 320
      const c = at ?? viewportCenter()
      created.push({ id: uid(), kind: 'image', imageId: id, x: c.x - w / 2 + offset, y: c.y - (w * ratio) / 2 + offset, w, h: w * ratio, rotation: 0, z: maxZ() + 1 + created.length })
      offset += 30
    }
    if (created.length) {
      commit([...items, ...created])
      setSel(created.map((c) => c.id))
    }
  }

  /* ---------- clavier ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      const ctrl = e.ctrlKey || e.metaKey
      if (e.code === 'Space') {
        setSpaceDown(true)
        e.preventDefault()
      }
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((ctrl && e.key.toLowerCase() === 'y') || (ctrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault()
        redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) {
        e.preventDefault()
        commit(items.filter((i) => !sel.includes(i.id) || i.locked))
        setSel([])
      } else if (ctrl && e.key.toLowerCase() === 'd' && sel.length) {
        e.preventDefault()
        duplicate()
      } else if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSel(items.filter((i) => !i.locked).map((i) => i.id))
      } else if (e.key === 'Escape') setSel([])
      else if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        commit(items.map((i) => (sel.includes(i.id) && !i.locked ? { ...i, x: i.x + dx, y: i.y + dy } : i)))
      } else if (ctrl && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        zoomBy(1.2)
      } else if (ctrl && e.key === '-') {
        e.preventDefault()
        zoomBy(1 / 1.2)
      } else if (ctrl && e.key === '0') {
        e.preventDefault()
        fit()
      }
    }
    const onUp = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  })

  /* ---------- zoom ---------- */
  const zoomBy = (f: number, around?: P) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const c = around ?? viewportCenter()
    setView((v) => {
      const zoom = Math.min(4, Math.max(0.1, v.zoom * f))
      return { zoom, x: c.x - ((c.x - v.x) * v.zoom) / zoom, y: c.y - ((c.y - v.y) * v.zoom) / zoom }
    })
  }
  const fit = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    if (!items.length) return setView({ x: -60, y: -40, zoom: 0.8 })
    const xs = items.flatMap((i) => [i.x, i.x + i.w])
    const ys = items.flatMap((i) => [i.y, i.y + i.h])
    const bx = Math.min(...xs) - 60
    const by = Math.min(...ys) - 60
    const bw = Math.max(...xs) + 60 - bx
    const bh = Math.max(...ys) + 60 - by
    const zoom = Math.min(2, r.width / bw, r.height / bh)
    setView({ zoom, x: bx - (r.width / zoom - bw) / 2, y: by - (r.height / zoom - bh) / 2 })
  }, [items])
  useEffect(() => {
    fit()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        setView((v) => {
          const c = { x: v.x + (e.clientX - r.left) / v.zoom, y: v.y + (e.clientY - r.top) / v.zoom }
          const zoom = Math.min(4, Math.max(0.1, v.zoom * Math.exp(-e.deltaY * 0.0022)))
          return { zoom, x: c.x - ((c.x - v.x) * v.zoom) / zoom, y: c.y - ((c.y - v.y) * v.zoom) / zoom }
        })
      } else setView((v) => ({ ...v, x: v.x + e.deltaX / v.zoom, y: v.y + e.deltaY / v.zoom }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------- pointeur ---------- */
  const onBgDown = (e: RPointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (spaceDown || e.button === 1) {
      drag.current = { kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, origView: view }
      return
    }
    const p = toWorld(e.clientX, e.clientY)
    if (!e.shiftKey) setSel([])
    drag.current = { kind: 'marquee', start: p, cur: p }
  }

  const onItemDown = (e: RPointerEvent, it: MoodItem) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (spaceDown || e.button === 1) {
      drag.current = { kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, origView: view }
      return
    }
    let nextSel = sel
    if (e.shiftKey) nextSel = sel.includes(it.id) ? sel.filter((x) => x !== it.id) : [...sel, it.id]
    else if (!sel.includes(it.id)) nextSel = [it.id]
    setSel(nextSel)
    const moving = items.filter((i) => nextSel.includes(i.id) && !i.locked)
    if (moving.length) drag.current = { kind: 'move', start: toWorld(e.clientX, e.clientY), orig: moving, moved: false }
  }

  const onHandleDown = (e: RPointerEvent, sx: number, sy: number) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (!one || one.locked) return
    drag.current = { kind: 'resize', sx, sy, start: toWorld(e.clientX, e.clientY), orig: one }
  }
  const onRotateDown = (e: RPointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (!one || one.locked) return
    const p = toWorld(e.clientX, e.clientY)
    const c = { x: one.x + one.w / 2, y: one.y + one.h / 2 }
    drag.current = { kind: 'rotate', orig: one, startAngle: (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI }
  }

  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      setView({ ...d.origView, x: d.origView.x - (e.clientX - d.startClient.x) / view.zoom, y: d.origView.y - (e.clientY - d.startClient.y) / view.zoom })
      return
    }
    const p = toWorld(e.clientX, e.clientY)
    if (d.kind === 'marquee') {
      d.cur = p
      force((n) => n + 1)
      return
    }
    if (d.kind === 'move') {
      let dx = p.x - d.start.x
      let dy = p.y - d.start.y
      if (!d.moved && Math.hypot(dx, dy) * view.zoom < 3) return
      d.moved = true
      // guides d'alignement (bords et centres des autres éléments)
      const ids = d.orig.map((o) => o.id)
      const bx = Math.min(...d.orig.map((o) => o.x)) + dx
      const by = Math.min(...d.orig.map((o) => o.y)) + dy
      const bw = Math.max(...d.orig.map((o) => o.x + o.w)) - Math.min(...d.orig.map((o) => o.x))
      const bh = Math.max(...d.orig.map((o) => o.y + o.h)) - Math.min(...d.orig.map((o) => o.y))
      const others = items.filter((i) => !ids.includes(i.id))
      const tx = others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])
      const ty = others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])
      const tol = SNAP_PX / view.zoom
      const gv: number[] = []
      const gh: number[] = []
      if (!e.altKey) {
        const mx = [bx, bx + bw / 2, bx + bw]
        let best = tol + 1
        let adj = 0
        for (const m of mx) for (const t of tx) if (Math.abs(t - m) < best) ((best = Math.abs(t - m)), (adj = t - m))
        if (best <= tol) {
          dx += adj
          mx.forEach((m) => tx.forEach((t) => Math.abs(t - (m + adj)) < 0.5 && gv.push(t)))
        }
        const my = [by, by + bh / 2, by + bh]
        best = tol + 1
        adj = 0
        for (const m of my) for (const t of ty) if (Math.abs(t - m) < best) ((best = Math.abs(t - m)), (adj = t - m))
        if (best <= tol) {
          dy += adj
          my.forEach((m) => ty.forEach((t) => Math.abs(t - (m + adj)) < 0.5 && gh.push(t)))
        }
      }
      setGuides({ v: gv, h: gh })
      live(items.map((i) => {
        const o = d.orig.find((x) => x.id === i.id)
        return o ? { ...i, x: o.x + dx, y: o.y + dy } : i
      }))
    }
    if (d.kind === 'resize') {
      const o = d.orig
      const a = (-o.rotation * Math.PI) / 180
      const wx = p.x - d.start.x
      const wy = p.y - d.start.y
      // delta dans le repère de l'élément
      const lx = wx * Math.cos(a) - wy * Math.sin(a)
      const ly = wx * Math.sin(a) + wy * Math.cos(a)
      let w = Math.max(20, o.w + lx * d.sx)
      let h = Math.max(20, o.h + ly * d.sy)
      const keepRatio = (o.kind === 'image' || o.kind === 'swatch') !== e.shiftKey
      if (keepRatio) {
        const r = o.h / o.w
        if (Math.abs(lx) > Math.abs(ly)) h = w * r
        else w = h / r
      }
      // le coin opposé reste fixe
      const dw = w - o.w
      const dh = h - o.h
      const cxl = (dw / 2) * d.sx
      const cyl = (dh / 2) * d.sy
      const b = (o.rotation * Math.PI) / 180
      const cx = o.x + o.w / 2 + cxl * Math.cos(b) - cyl * Math.sin(b)
      const cy = o.y + o.h / 2 + cxl * Math.sin(b) + cyl * Math.cos(b)
      live(items.map((i) => (i.id === o.id ? { ...i, w, h, x: cx - w / 2, y: cy - h / 2 } : i)))
    }
    if (d.kind === 'rotate') {
      const o = d.orig
      const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 }
      const ang = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
      let r = o.rotation + ang - d.startAngle
      r = e.shiftKey ? Math.round(r / 15) * 15 : Math.abs(r % 90) < 2 || Math.abs(r % 90) > 88 ? Math.round(r / 90) * 90 : r
      live(items.map((i) => (i.id === o.id ? { ...i, rotation: ((r % 360) + 360) % 360 } : i)))
    }
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    setGuides({ v: [], h: [] })
    if (!d) return
    if (d.kind === 'marquee') {
      const x0 = Math.min(d.start.x, d.cur.x)
      const x1 = Math.max(d.start.x, d.cur.x)
      const y0 = Math.min(d.start.y, d.cur.y)
      const y1 = Math.max(d.start.y, d.cur.y)
      if (x1 - x0 > 4 || y1 - y0 > 4) {
        const hit = items.filter((i) => !i.locked && i.x < x1 && i.x + i.w > x0 && i.y < y1 && i.y + i.h > y0).map((i) => i.id)
        setSel((s) => [...new Set([...s, ...hit])])
      }
      force((n) => n + 1)
      return
    }
    if (d.kind === 'pan') return
    if (d.kind === 'move' && !d.moved) return
    // enregistre l'état d'avant le geste dans l'historique
    const before = items.map((i) => {
      if (d.kind === 'move') return d.orig.find((o) => o.id === i.id) ?? i
      return i.id === d.orig.id ? d.orig : i
    })
    past.current.push(before)
    future.current = []
  }

  /* ---------- actions ---------- */
  const duplicate = () => {
    const copies = selected.map((i, k) => ({ ...i, id: uid(), x: i.x + 24, y: i.y + 24, z: maxZ() + 1 + k, locked: false }))
    commit([...items, ...copies])
    setSel(copies.map((c) => c.id))
  }
  const order = (where: 'front' | 'back' | 'up' | 'down') => {
    if (!selected.length) return
    const sorted = [...items].sort((a, b) => a.z - b.z)
    const ids = new Set(sel)
    let next: MoodItem[]
    if (where === 'front') next = [...sorted.filter((i) => !ids.has(i.id)), ...sorted.filter((i) => ids.has(i.id))]
    else if (where === 'back') next = [...sorted.filter((i) => ids.has(i.id)), ...sorted.filter((i) => !ids.has(i.id))]
    else {
      next = [...sorted]
      const idxs = next.map((i, k) => (ids.has(i.id) ? k : -1)).filter((k) => k >= 0)
      if (where === 'up') idxs.reverse().forEach((k) => k < next.length - 1 && !ids.has(next[k + 1].id) && ([next[k], next[k + 1]] = [next[k + 1], next[k]]))
      else idxs.forEach((k) => k > 0 && !ids.has(next[k - 1].id) && ([next[k], next[k - 1]] = [next[k - 1], next[k]]))
    }
    commit(next.map((i, k) => ({ ...i, z: k })))
  }
  const align = (how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    if (selected.length < 2) return
    const x0 = Math.min(...selected.map((i) => i.x))
    const x1 = Math.max(...selected.map((i) => i.x + i.w))
    const y0 = Math.min(...selected.map((i) => i.y))
    const y1 = Math.max(...selected.map((i) => i.y + i.h))
    commit(
      items.map((i) => {
        if (!sel.includes(i.id) || i.locked) return i
        switch (how) {
          case 'left': return { ...i, x: x0 }
          case 'right': return { ...i, x: x1 - i.w }
          case 'hcenter': return { ...i, x: (x0 + x1) / 2 - i.w / 2 }
          case 'top': return { ...i, y: y0 }
          case 'bottom': return { ...i, y: y1 - i.h }
          case 'vcenter': return { ...i, y: (y0 + y1) / 2 - i.h / 2 }
        }
      }),
    )
  }
  const saveSharedPalette = async (colors: string[]) => {
    await db.palettes.add({ ...base(), name: board.title ? `Palette · ${board.title}` : 'Palette', colors })
    toast('Palette enregistrée : réutilisable dans tes autres créations')
  }

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.z - b.z), [items])
  const marquee = drag.current?.kind === 'marquee' ? drag.current : null
  const dark = ['#2e2a26', '#1f2a33'].includes(board.background)

  return (
    <div className="mbe">
      <header className="mbe-top">
        <button className="btn ghost sm" onClick={() => navigate('/moodboards')}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <input className="mbe-title" placeholder="Sans titre" value={board.title} onChange={(e) => setBoard((b) => ({ ...b, title: e.target.value }))} />
        <SaveStatus state={state} />
        <span className="spacer" />
        <button className="btn ghost icon sm" title="Annuler (Ctrl+Z)" aria-label="Annuler" onClick={undo} disabled={!past.current.length}>
          <Icon name="undo" size={17} />
        </button>
        <button className="btn ghost icon sm" title="Rétablir (Ctrl+Y)" aria-label="Rétablir" onClick={redo} disabled={!future.current.length}>
          <Icon name="redo" size={17} />
        </button>
        <span className="tb-sep" />
        <button className="btn ghost icon sm" title="Dézoomer (Ctrl −)" aria-label="Dézoomer" onClick={() => zoomBy(1 / 1.2)}>
          <Icon name="zoomOut" size={17} />
        </button>
        <button className="btn ghost sm mbe-zoom" title="Tout afficher (Ctrl 0)" onClick={fit}>
          {Math.round(view.zoom * 100)} %
        </button>
        <button className="btn ghost icon sm" title="Zoomer (Ctrl +)" aria-label="Zoomer" onClick={() => zoomBy(1.2)}>
          <Icon name="zoomIn" size={17} />
        </button>
        <span className="tb-sep" />
        <Menu
          trigger={
            <button className="btn sm">
              <Icon name="download" size={15} /> Exporter
            </button>
          }
          items={[
            { label: 'Image PNG', icon: 'image', onClick: () => exportBoardPNG(board.title || 'moodboard', board.background, items).catch(() => toast('L’export a échoué', { kind: 'error' })) },
            { label: 'PDF (impression)', icon: 'printer', onClick: () => printBoard(board.title, board.background, items).catch(() => toast('L’export a échoué', { kind: 'error' })) },
          ]}
        />
        <button className={`btn ghost icon sm ${panelOpen ? 'on' : ''}`} aria-label="Panneau" onClick={() => setPanelOpen((o) => !o)}>
          <Icon name="layers" size={17} />
        </button>
      </header>

      <div className="mbe-body">
        <nav className="mbe-tools">
          <ToolBtn icon="image" label="Images" onClick={async () => addImages(await pickFiles('image/*', true))} />
          <ToolBtn icon="type" label="Texte" onClick={() => add({ kind: 'text', w: 360, h: 60, text: 'Un mot doux', font: 'display', fontSize: 40, color: dark ? '#f6ede3' : '#2e2a26' })} />
          <ToolBtn icon="sticky" label="Annotation" onClick={() => add({ kind: 'note', w: 240, h: 150, text: 'Une idée…', fill: '#fbf1c7', fontSize: 26 })} />
          <ToolBtn icon="palette" label="Palette" onClick={() => add({ kind: 'palette', w: 420, h: 130, colors: ['#efe6d8', '#d8c3a5', '#c98b8b', '#8fa58a'] })} />
          <ToolBtn icon="square" label="Forme" onClick={() => add({ kind: 'shape', shape: 'rect', w: 240, h: 240, fill: '#f3e1df' })} />
          <ToolBtn icon="layers" label="Matière" onClick={() => add({ kind: 'swatch', w: 160, h: 180, fill: '#d8c3a5', label: 'Matière' })} />
          <ToolBtn icon="link" label="Lien" onClick={() => setLinkUrl({ url: '', label: '' })} />
        </nav>

        <div
          className={`mbe-canvas ${spaceDown ? 'panning' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const files = Array.from(e.dataTransfer.files)
            if (files.length) addImages(files, toWorld(e.clientX, e.clientY))
            else {
              const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
              if (/^https?:\/\//.test(url)) add({ kind: 'link', w: 300, h: 90, url, label: '', ...toWorldCentered(toWorld(e.clientX, e.clientY), 300, 90) })
            }
          }}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`${view.x} ${view.y} ${size.w / view.zoom} ${size.h / view.zoom}`}
            onPointerMove={onMove}
            onPointerUp={onUp}
            style={{ background: board.background }}
          >
            <rect x={view.x - 10000} y={view.y - 10000} width={40000} height={40000} fill="transparent" onPointerDown={onBgDown} />
            {sortedItems.map((it) => (
              <g key={it.id} onPointerDown={(e) => onItemDown(e, it)} onDoubleClick={() => setPanelOpen(true)} style={{ cursor: it.locked ? 'default' : spaceDown ? 'grab' : 'move' }}>
                <MoodItemView item={it} />
              </g>
            ))}
            {/* sélection */}
            {selected.map((it) => (
              <g key={'s' + it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rotation} ${it.w / 2} ${it.h / 2})`} pointerEvents="none">
                <rect width={it.w} height={it.h} fill="none" stroke={it.locked ? '#958b80' : 'var(--accent)'} strokeWidth={1.5 / view.zoom} strokeDasharray={it.locked ? `${4 / view.zoom}` : undefined} />
              </g>
            ))}
            {one && !one.locked && (
              <g transform={`translate(${one.x} ${one.y}) rotate(${one.rotation} ${one.w / 2} ${one.h / 2})`}>
                <line x1={one.w / 2} y1={0} x2={one.w / 2} y2={-28 / view.zoom} stroke="var(--accent)" strokeWidth={1.5 / view.zoom} />
                <circle cx={one.w / 2} cy={-32 / view.zoom} r={7 / view.zoom} fill="#fff" stroke="var(--accent)" strokeWidth={1.5 / view.zoom} style={{ cursor: 'grab' }} onPointerDown={onRotateDown} />
                {[
                  [-1, -1],
                  [1, -1],
                  [1, 1],
                  [-1, 1],
                ].map(([sx, sy]) => (
                  <rect
                    key={`${sx}${sy}`}
                    x={(sx < 0 ? 0 : one.w) - 5 / view.zoom}
                    y={(sy < 0 ? 0 : one.h) - 5 / view.zoom}
                    width={10 / view.zoom}
                    height={10 / view.zoom}
                    rx={2 / view.zoom}
                    fill="#fff"
                    stroke="var(--accent)"
                    strokeWidth={1.5 / view.zoom}
                    style={{ cursor: sx * sy > 0 ? 'nwse-resize' : 'nesw-resize' }}
                    onPointerDown={(e) => onHandleDown(e, sx, sy)}
                  />
                ))}
              </g>
            )}
            {guides.v.map((x, i) => (
              <line key={'v' + i} x1={x} x2={x} y1={view.y - 5000} y2={view.y + 10000} stroke="#e0679a" strokeWidth={1 / view.zoom} pointerEvents="none" />
            ))}
            {guides.h.map((y, i) => (
              <line key={'h' + i} y1={y} y2={y} x1={view.x - 5000} x2={view.x + 10000} stroke="#e0679a" strokeWidth={1 / view.zoom} pointerEvents="none" />
            ))}
            {marquee && (
              <rect
                x={Math.min(marquee.start.x, marquee.cur.x)}
                y={Math.min(marquee.start.y, marquee.cur.y)}
                width={Math.abs(marquee.cur.x - marquee.start.x)}
                height={Math.abs(marquee.cur.y - marquee.start.y)}
                fill="color-mix(in srgb, var(--accent) 10%, transparent)"
                stroke="var(--accent)"
                strokeWidth={1 / view.zoom}
                pointerEvents="none"
              />
            )}
          </svg>
          {items.length === 0 && (
            <div className="mbe-empty">
              <span className="hand">Glisse des images ici</span>
              ou utilise les outils à gauche
            </div>
          )}
          <div className="mbe-hint">Espace + glisser pour se déplacer · Ctrl + molette pour zoomer · Alt pour ignorer les guides</div>
        </div>

        {panelOpen && (
          <aside className="mbe-panel">
            {selected.length === 0 && (
              <>
                <div className="mbe-section">
                  <span className="label">Fond</span>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {BACKGROUNDS.map((c) => (
                      <button key={c} className={`swatch-btn ${board.background === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Fond ${c}`} onClick={() => setBoard((b) => ({ ...b, background: c }))} />
                    ))}
                    <input type="color" value={board.background} onChange={(e) => setBoard((b) => ({ ...b, background: e.target.value }))} className="color-input" aria-label="Couleur de fond personnalisée" />
                  </div>
                </div>
                <div className="mbe-section">
                  <LinkedItems type="moodboard" id={initial.id} title="Relié à" />
                </div>
                <SharedPalettes onUse={(colors) => add({ kind: 'palette', w: Math.max(200, colors.length * 90), h: 130, colors })} />
              </>
            )}

            {selected.length > 1 && (
              <div className="mbe-section">
                <span className="label">{selected.length} éléments</span>
                <div className="mbe-align">
                  {(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const).map((a) => (
                    <button key={a} className="btn sm" onClick={() => align(a)}>
                      {{ left: '⇤ Gauche', hcenter: '↔ Centre', right: 'Droite ⇥', top: '⤒ Haut', vcenter: '↕ Milieu', bottom: 'Bas ⤓' }[a]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {one && <ItemProps item={one} onChange={(p) => update(one.id, p)} onSavePalette={saveSharedPalette} />}

            {selected.length > 0 && (
              <div className="mbe-section">
                <span className="label">Ordre et actions</span>
                <div className="mbe-align">
                  <button className="btn sm" onClick={() => order('front')}>
                    <Icon name="bringFront" size={14} /> Premier plan
                  </button>
                  <button className="btn sm" onClick={() => order('back')}>
                    <Icon name="sendBack" size={14} /> Arrière-plan
                  </button>
                  <button className="btn sm" onClick={() => order('up')}>
                    Avancer
                  </button>
                  <button className="btn sm" onClick={() => order('down')}>
                    Reculer
                  </button>
                  <button className="btn sm" onClick={duplicate}>
                    <Icon name="copy" size={14} /> Dupliquer
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => {
                      const lock = !selected.every((s) => s.locked)
                      commit(items.map((i) => (sel.includes(i.id) ? { ...i, locked: lock } : i)))
                    }}
                  >
                    <Icon name={selected.every((s) => s.locked) ? 'unlock' : 'lock'} size={14} /> {selected.every((s) => s.locked) ? 'Déverrouiller' : 'Verrouiller'}
                  </button>
                  <button
                    className="btn sm danger"
                    onClick={() => {
                      commit(items.filter((i) => !sel.includes(i.id)))
                      setSel([])
                    }}
                  >
                    <Icon name="trash" size={14} /> Supprimer
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      <Modal
        open={!!linkUrl}
        onClose={() => setLinkUrl(null)}
        title="Ajouter un lien"
        width={420}
        footer={
          <>
            <button className="btn ghost" onClick={() => setLinkUrl(null)}>
              Annuler
            </button>
            <button
              className="btn primary"
              disabled={!linkUrl?.url.trim()}
              onClick={() => {
                const u = linkUrl!.url.trim()
                add({ kind: 'link', w: 300, h: 90, url: /^[a-z]+:/i.test(u) ? u : `https://${u}`, label: linkUrl!.label.trim() })
                setLinkUrl(null)
              }}
            >
              Ajouter
            </button>
          </>
        }
      >
        <input className="input" autoFocus placeholder="https://…" value={linkUrl?.url ?? ''} onChange={(e) => setLinkUrl((l) => l && { ...l, url: e.target.value })} style={{ marginBottom: 8 }} />
        <input className="input" placeholder="Titre (facultatif)" value={linkUrl?.label ?? ''} onChange={(e) => setLinkUrl((l) => l && { ...l, label: e.target.value })} />
      </Modal>
    </div>
  )
}

const toWorldCentered = (p: P, w: number, h: number) => ({ x: p.x - w / 2, y: p.y - h / 2 })

function ToolBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button className="mbe-tool" onClick={onClick} title={label}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  )
}

function ItemProps({ item, onChange, onSavePalette }: { item: MoodItem; onChange: (p: Partial<MoodItem>) => void; onSavePalette: (c: string[]) => void }) {
  const [text, setText] = useState(item.text ?? '')
  useEffect(() => setText(item.text ?? ''), [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const label = { image: 'Image', text: 'Texte', note: 'Annotation', palette: 'Palette', link: 'Lien', shape: 'Forme', swatch: 'Matière' }[item.kind]

  return (
    <div className="mbe-section">
      <span className="label">{label}</span>
      {(item.kind === 'text' || item.kind === 'note') && (
        <>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== item.text && onChange({ text })} style={{ minHeight: 70 }} />
          {item.kind === 'text' && (
            <div className="seg" style={{ margin: '8px 0' }}>
              {(['display', 'body', 'hand'] as const).map((f) => (
                <button key={f} className={(item.font ?? 'display') === f ? 'on' : ''} onClick={() => onChange({ font: f })}>
                  {f === 'display' ? 'Élégant' : f === 'body' ? 'Simple' : 'Manuscrit'}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <label className="faint" style={{ fontSize: '0.8rem', width: 60 }}>
              Taille
            </label>
            <input type="range" min={12} max={140} value={item.fontSize ?? 32} onChange={(e) => onChange({ fontSize: +e.target.value })} style={{ flex: 1 }} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="faint" style={{ fontSize: '0.8rem', width: 60 }}>
              Couleur
            </label>
            <input type="color" className="color-input" value={item.color ?? '#2e2a26'} onChange={(e) => onChange({ color: e.target.value })} />
            {item.kind === 'note' && (
              <>
                <label className="faint" style={{ fontSize: '0.8rem' }}>
                  Papier
                </label>
                <input type="color" className="color-input" value={item.fill ?? '#fbf1c7'} onChange={(e) => onChange({ fill: e.target.value })} />
              </>
            )}
          </div>
        </>
      )}
      {item.kind === 'shape' && (
        <>
          <div className="seg" style={{ marginBottom: 8 }}>
            {(['rect', 'circle', 'arch', 'blob'] as const).map((s) => (
              <button key={s} className={(item.shape ?? 'rect') === s ? 'on' : ''} onClick={() => onChange({ shape: s })}>
                {{ rect: 'Carré', circle: 'Rond', arch: 'Arche', blob: 'Galet' }[s]}
              </button>
            ))}
          </div>
          <input type="color" className="color-input" value={item.fill ?? '#f3e1df'} onChange={(e) => onChange({ fill: e.target.value })} />
        </>
      )}
      {item.kind === 'swatch' && (
        <>
          <input className="input" value={item.label ?? ''} placeholder="Nom de la matière" onChange={(e) => onChange({ label: e.target.value })} style={{ marginBottom: 8 }} />
          <div className="row">
            <input type="color" className="color-input" value={item.fill ?? '#d8c3a5'} onChange={(e) => onChange({ fill: e.target.value, imageId: undefined })} />
            <button
              className="btn sm"
              onClick={async () => {
                const [f] = await pickFiles('image/*')
                if (f) onChange({ imageId: await saveAsset(f) })
              }}
            >
              Photo de texture
            </button>
          </div>
        </>
      )}
      {item.kind === 'palette' && (
        <>
          <div className="row wrap" style={{ gap: 6 }}>
            {(item.colors ?? []).map((c, i) => (
              <div key={i} className="pal-edit">
                <input type="color" className="color-input" value={c} onChange={(e) => onChange({ colors: item.colors!.map((x, k) => (k === i ? e.target.value : x)) })} />
                <button className="pal-x" aria-label="Retirer la couleur" onClick={() => onChange({ colors: item.colors!.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </div>
            ))}
            <button className="btn sm" onClick={() => onChange({ colors: [...(item.colors ?? []), '#cccccc'] })}>
              + couleur
            </button>
          </div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => onSavePalette(item.colors ?? [])}>
            <Icon name="palette" size={14} /> Enregistrer comme palette partagée
          </button>
        </>
      )}
      {item.kind === 'link' && (
        <>
          <input className="input" value={item.label ?? ''} placeholder="Titre" onChange={(e) => onChange({ label: e.target.value })} style={{ marginBottom: 8 }} />
          <input className="input" value={item.url ?? ''} placeholder="https://…" onChange={(e) => onChange({ url: e.target.value })} />
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.84rem', display: 'inline-block', marginTop: 6 }}>
              Ouvrir le lien
            </a>
          )}
        </>
      )}
      {item.kind === 'image' && (
        <button
          className="btn sm"
          onClick={async () => {
            const [f] = await pickFiles('image/*')
            if (f) onChange({ imageId: await saveAsset(f) })
          }}
        >
          Remplacer l’image
        </button>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <label className="faint" style={{ fontSize: '0.8rem', width: 60 }}>
          Rotation
        </label>
        <input type="range" min={0} max={359} value={Math.round(item.rotation)} onChange={(e) => onChange({ rotation: +e.target.value })} style={{ flex: 1 }} />
        <span className="faint" style={{ fontSize: '0.8rem', width: 36, textAlign: 'right' }}>
          {Math.round(item.rotation)}°
        </span>
      </div>
    </div>
  )
}

function SharedPalettes({ onUse }: { onUse: (colors: string[]) => void }) {
  const palettes = useLiveQuery(() => db.palettes.orderBy('updatedAt').reverse().toArray(), []) ?? []
  if (!palettes.length) return null
  return (
    <div className="mbe-section">
      <span className="label">Mes palettes</span>
      {palettes.map((p) => (
        <div key={p.id} className="row" style={{ marginBottom: 6 }}>
          <button className="pal-row" onClick={() => onUse(p.colors)} title="Ajouter au moodboard">
            {p.colors.map((c, i) => (
              <span key={i} style={{ background: c }} />
            ))}
          </button>
          <button className="btn ghost icon sm" aria-label="Supprimer la palette" onClick={() => db.palettes.delete(p.id)}>
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
