import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { uid } from '../../db/db'
import { CATALOG, MATERIALS, catalogItem } from './catalog'
import {
  cm,
  dist,
  furnitureCorners,
  newWall,
  planBounds,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  projectOnWall,
  rectRoom,
  snapAngle,
  snapGrid,
  snapPoint,
  wallAngle,
  wallLength,
} from './geometry'
import type { Floor, Furniture, Light, Opening, PlanData, Pt, Wall } from './types'

export type PlanTool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'furniture' | 'light' | 'pan'
export type Sel = { kind: 'wall' | 'opening' | 'furniture' | 'floor' | 'light'; id: string } | null

interface Props {
  data: PlanData
  onChange: (d: PlanData, commit: boolean) => void
  tool: PlanTool
  setTool: (t: PlanTool) => void
  placing: string | null
  sel: Sel
  setSel: (s: Sel) => void
  fitSignal: number
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; v: View }
  | { kind: 'room'; a: Pt; b: Pt }
  | { kind: 'move-furniture'; id: string; off: Pt; before: PlanData }
  | { kind: 'rotate-furniture'; id: string; before: PlanData }
  | { kind: 'move-light'; id: string; before: PlanData }
  | { kind: 'move-opening'; id: string; before: PlanData }
  | { kind: 'move-endpoint'; at: Pt; before: PlanData }
  | { kind: 'move-wall'; id: string; start: Pt; before: PlanData; a: Pt; b: Pt }
  | { kind: 'move-floor-pt'; id: string; index: number; before: PlanData }

interface View {
  x: number
  y: number
  scale: number // px par cm
}

const GRID = 10

/** Plan 2D : grille, accrochage, cotations, murs, ouvertures, meubles, lumières. */
export function PlanEditor({ data, onChange, tool, setTool, placing, sel, setSel, fitSignal }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ x: -100, y: -100, scale: 1 })
  const [hover, setHover] = useState<Pt | null>(null)
  const [chain, setChain] = useState<Pt[]>([]) // tracé de murs en cours
  const drag = useRef<Drag | null>(null)
  const [, force] = useState(0)
  const keys = useRef({ shift: false, alt: false })

  useEffect(() => {
    const el = svg.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = () => {
    const b = planBounds(data)
    const pad = 120
    const scale = Math.min((size.w - 40) / (b.w + pad * 2), (size.h - 40) / (b.h + pad * 2), 3)
    setView({ scale, x: b.x + b.w / 2 - size.w / 2 / scale, y: b.y + b.h / 2 - size.h / 2 / scale })
  }
  useEffect(fit, [fitSignal, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps

  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect()
    return { x: view.x + (e.clientX - r.left) / view.scale, y: view.y + (e.clientY - r.top) / view.scale }
  }
  const tol = 12 / view.scale

  /* ---------- molette : zoom / déplacement ---------- */
  useEffect(() => {
    const el = svg.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey || e.altKey || Math.abs(e.deltaY) > 0) {
        if (!(e.ctrlKey || e.metaKey || e.altKey) && e.shiftKey) {
          setView((v) => ({ ...v, x: v.x + e.deltaY / v.scale }))
          return
        }
        if (!(e.ctrlKey || e.metaKey || e.altKey) && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          setView((v) => ({ ...v, x: v.x + e.deltaX / v.scale }))
          return
        }
        const f = Math.exp(-e.deltaY * 0.0018)
        setView((v) => {
          const scale = Math.min(8, Math.max(0.1, v.scale * f))
          const wx = v.x + (e.clientX - r.left) / v.scale
          const wy = v.y + (e.clientY - r.top) / v.scale
          return { scale, x: wx - (e.clientX - r.left) / scale, y: wy - (e.clientY - r.top) / scale }
        })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------- clavier ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current = { shift: e.shiftKey, alt: e.altKey }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        if (chain.length) finishChain()
        else setSel(null)
      }
      if (e.key === 'Enter' && chain.length) finishChain()
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        removeSel()
      }
      if (e.key.toLowerCase() === 'r' && sel?.kind === 'furniture' && !e.ctrlKey) {
        const f = data.furniture.find((x) => x.id === sel.id)
        if (f) onChange({ ...data, furniture: data.furniture.map((x) => (x.id === f.id ? { ...x, rotation: (x.rotation + (e.shiftKey ? 15 : 90)) % 360 } : x)) }, true)
      }
    }
    const up = (e: KeyboardEvent) => (keys.current = { shift: e.shiftKey, alt: e.altKey })
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  useEffect(() => {
    if (tool !== 'wall' && chain.length) finishChain()
  }, [tool]) // eslint-disable-line react-hooks/exhaustive-deps

  const removeSel = () => {
    if (!sel) return
    const d = { ...data }
    if (sel.kind === 'wall') {
      d.walls = d.walls.filter((w) => w.id !== sel.id)
      d.openings = d.openings.filter((o) => o.wallId !== sel.id)
    } else if (sel.kind === 'opening') d.openings = d.openings.filter((o) => o.id !== sel.id)
    else if (sel.kind === 'furniture') d.furniture = d.furniture.filter((o) => o.id !== sel.id)
    else if (sel.kind === 'floor') d.floors = d.floors.filter((o) => o.id !== sel.id)
    else if (sel.kind === 'light') d.lights = d.lights.filter((o) => o.id !== sel.id)
    onChange(d, true)
    setSel(null)
  }

  /** Termine la chaîne de murs ; si elle est fermée, crée aussi le sol de la pièce. */
  const finishChain = () => {
    const pts = chain
    setChain([])
    if (pts.length < 2) return
    const walls = pts.slice(1).map((p, i) => newWall(pts[i], p))
    const closed = pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 1
    const floors = closed ? [...data.floors, { id: uid(), name: `Pièce ${data.floors.length + 1}`, points: pts.slice(0, -1), material: 'oak' }] : data.floors
    onChange({ ...data, walls: [...data.walls, ...walls], floors }, true)
  }

  /* ---------- détection ---------- */
  const hitFurniture = (p: Pt) => [...data.furniture].reverse().find((f) => pointInPolygon(p, furnitureCorners(f)))
  const hitOpening = (p: Pt) =>
    data.openings.find((o) => {
      const w = data.walls.find((x) => x.id === o.wallId)
      if (!w) return false
      const pr = projectOnWall(w, p)
      return pr.d < w.thickness / 2 + tol && Math.abs(pr.t - o.t) * wallLength(w) < o.width / 2
    })
  const hitWall = (p: Pt) => data.walls.find((w) => projectOnWall(w, p).d < w.thickness / 2 + tol)
  const hitEndpoint = (p: Pt) => {
    for (const w of data.walls) for (const e of [w.a, w.b]) if (dist(e, p) < tol) return e
    return null
  }
  const hitLight = (p: Pt) => data.lights.find((l) => dist(l, p) < 18 / view.scale + 10)
  const hitFloor = (p: Pt) => [...data.floors].reverse().find((f) => pointInPolygon(p, f.points))

  /* ---------- pointeur ---------- */
  const onDown = (e: RPointerEvent) => {
    if (e.button === 2) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const raw = toWorld(e)
    if (tool === 'pan' || e.button === 1) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: view }
      return
    }
    const snapped = snapPoint(raw, data.walls, GRID, tol)

    if (tool === 'wall') {
      const prev = chain[chain.length - 1]
      const p = prev ? snapAngle(prev, snapped, e.shiftKey) : snapped
      const q = { x: Math.round(p.x), y: Math.round(p.y) }
      // clic sur le premier point : on ferme la pièce
      if (chain.length > 2 && dist(q, chain[0]) < tol * 1.5) {
        const pts = [...chain, { ...chain[0] }]
        setChain(pts)
        window.setTimeout(() => {
          const walls = pts.slice(1).map((pt, i) => newWall(pts[i], pt))
          onChange({ ...data, walls: [...data.walls, ...walls], floors: [...data.floors, { id: uid(), name: `Pièce ${data.floors.length + 1}`, points: pts.slice(0, -1), material: 'oak' }] }, true)
          setChain([])
        })
        return
      }
      if (prev && dist(prev, q) < 1) return
      setChain([...chain, q])
      return
    }
    if (tool === 'room') {
      drag.current = { kind: 'room', a: snapped, b: snapped }
      return
    }
    if (tool === 'door' || tool === 'window') {
      const w = hitWall(raw)
      if (!w) return
      const pr = projectOnWall(w, raw)
      const width = tool === 'door' ? 83 : 120
      const L = wallLength(w)
      const t = Math.min(1 - width / 2 / L, Math.max(width / 2 / L, pr.t))
      const o: Opening = { id: uid(), wallId: w.id, kind: tool, t, width: Math.min(width, L - 10), height: tool === 'door' ? 210 : 125, sill: tool === 'door' ? 0 : 95 }
      onChange({ ...data, openings: [...data.openings, o] }, true)
      setSel({ kind: 'opening', id: o.id })
      setTool('select')
      return
    }
    if (tool === 'furniture' && placing) {
      const c = catalogItem(placing)
      if (!c) return
      const f: Furniture = { id: uid(), type: c.id, x: snapGrid(raw.x, 5), y: snapGrid(raw.y, 5), w: c.w, d: c.d, h: c.h, rotation: 0, color: c.color }
      onChange({ ...data, furniture: [...data.furniture, f] }, true)
      setSel({ kind: 'furniture', id: f.id })
      setTool('select')
      return
    }
    if (tool === 'light') {
      const l: Light = { id: uid(), x: snapGrid(raw.x, 5), y: snapGrid(raw.y, 5), z: 240, intensity: 1, color: '#ffe8c8' }
      onChange({ ...data, lights: [...data.lights, l] }, true)
      setSel({ kind: 'light', id: l.id })
      setTool('select')
      return
    }

    // ----- sélection -----
    // poignée de rotation du meuble sélectionné
    if (sel?.kind === 'furniture') {
      const f = data.furniture.find((x) => x.id === sel.id)
      if (f && dist(raw, rotHandle(f)) < 14 / view.scale) {
        drag.current = { kind: 'rotate-furniture', id: f.id, before: data }
        return
      }
    }
    if (sel?.kind === 'floor') {
      const f = data.floors.find((x) => x.id === sel.id)
      const i = f ? f.points.findIndex((p) => dist(p, raw) < tol) : -1
      if (f && i >= 0) {
        drag.current = { kind: 'move-floor-pt', id: f.id, index: i, before: data }
        return
      }
    }
    const l = hitLight(raw)
    if (l) {
      setSel({ kind: 'light', id: l.id })
      drag.current = { kind: 'move-light', id: l.id, before: data }
      return
    }
    const fu = hitFurniture(raw)
    if (fu) {
      setSel({ kind: 'furniture', id: fu.id })
      drag.current = { kind: 'move-furniture', id: fu.id, off: { x: raw.x - fu.x, y: raw.y - fu.y }, before: data }
      return
    }
    const op = hitOpening(raw)
    if (op) {
      setSel({ kind: 'opening', id: op.id })
      drag.current = { kind: 'move-opening', id: op.id, before: data }
      return
    }
    const ep = hitEndpoint(raw)
    if (ep) {
      drag.current = { kind: 'move-endpoint', at: { ...ep }, before: data }
      return
    }
    const w = hitWall(raw)
    if (w) {
      setSel({ kind: 'wall', id: w.id })
      drag.current = { kind: 'move-wall', id: w.id, start: raw, before: data, a: { ...w.a }, b: { ...w.b } }
      return
    }
    const fl = hitFloor(raw)
    if (fl) {
      setSel({ kind: 'floor', id: fl.id })
      return
    }
    setSel(null)
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: view }
  }

  const onMove = (e: RPointerEvent) => {
    const raw = toWorld(e)
    setHover(raw)
    const d = drag.current
    if (!d) return
    switch (d.kind) {
      case 'pan':
        setView({ ...d.v, x: d.v.x - (e.clientX - d.sx) / d.v.scale, y: d.v.y - (e.clientY - d.sy) / d.v.scale })
        return
      case 'room':
        d.b = snapPoint(raw, data.walls, GRID, tol)
        force((n) => n + 1)
        return
      case 'move-furniture': {
        const x = snapGrid(raw.x - d.off.x, e.altKey ? 1 : 5)
        const y = snapGrid(raw.y - d.off.y, e.altKey ? 1 : 5)
        onChange({ ...data, furniture: data.furniture.map((f) => (f.id === d.id ? { ...f, x, y } : f)) }, false)
        return
      }
      case 'rotate-furniture': {
        const f = data.furniture.find((x) => x.id === d.id)!
        let a = (Math.atan2(raw.y - f.y, raw.x - f.x) * 180) / Math.PI + 90
        a = e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15
        onChange({ ...data, furniture: data.furniture.map((x) => (x.id === d.id ? { ...x, rotation: ((a % 360) + 360) % 360 } : x)) }, false)
        return
      }
      case 'move-light':
        onChange({ ...data, lights: data.lights.map((l) => (l.id === d.id ? { ...l, x: snapGrid(raw.x, 5), y: snapGrid(raw.y, 5) } : l)) }, false)
        return
      case 'move-opening': {
        const o = data.openings.find((x) => x.id === d.id)!
        const w = data.walls.find((x) => x.id === o.wallId)!
        const L = wallLength(w)
        const t = Math.min(1 - o.width / 2 / L, Math.max(o.width / 2 / L, projectOnWall(w, raw).t))
        onChange({ ...data, openings: data.openings.map((x) => (x.id === d.id ? { ...x, t: snapGrid(t * L, 5) / L } : x)) }, false)
        return
      }
      case 'move-endpoint': {
        const p = snapPoint(raw, d.before.walls.filter((w) => dist(w.a, d.at) > 0.5 && dist(w.b, d.at) > 0.5), GRID, tol)
        const moveP = (q: Pt) => (dist(q, d.at) < 0.5 ? { ...p } : q)
        onChange(
          {
            ...data,
            walls: d.before.walls.map((w) => ({ ...w, a: moveP(w.a), b: moveP(w.b) })),
            floors: d.before.floors.map((f) => ({ ...f, points: f.points.map(moveP) })),
          },
          false,
        )
        return
      }
      case 'move-wall': {
        const dx = snapGrid(raw.x - d.start.x, GRID)
        const dy = snapGrid(raw.y - d.start.y, GRID)
        const na = { x: d.a.x + dx, y: d.a.y + dy }
        const nb = { x: d.b.x + dx, y: d.b.y + dy }
        const moveP = (q: Pt) => (dist(q, d.a) < 0.5 ? na : dist(q, d.b) < 0.5 ? nb : q)
        onChange({ ...data, walls: d.before.walls.map((w) => (w.id === d.id ? { ...w, a: na, b: nb } : { ...w, a: moveP(w.a), b: moveP(w.b) })), floors: d.before.floors.map((f) => ({ ...f, points: f.points.map(moveP) })) }, false)
        return
      }
      case 'move-floor-pt': {
        const p = snapPoint(raw, data.walls, GRID, tol)
        onChange({ ...data, floors: data.floors.map((f) => (f.id === d.id ? { ...f, points: f.points.map((q, i) => (i === d.index ? p : q)) } : f)) }, false)
        return
      }
    }
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'room') {
      const x = Math.min(d.a.x, d.b.x)
      const y = Math.min(d.a.y, d.b.y)
      const w = Math.abs(d.b.x - d.a.x)
      const h = Math.abs(d.b.y - d.a.y)
      if (w < 50 || h < 50) return force((n) => n + 1)
      const r = rectRoom(x, y, w, h, `Pièce ${data.floors.length + 1}`)
      onChange({ ...data, walls: [...data.walls, ...r.walls], floors: [...data.floors, r.floor] }, true)
      setTool('select')
      return
    }
    if (d.kind !== 'pan') onChange(data, true)
  }

  /* ---------- rendu ---------- */
  const vb = `${view.x} ${view.y} ${size.w / view.scale} ${size.h / view.scale}`
  const px = (n: number) => n / view.scale // taille écran → monde
  const grid = useMemo(() => {
    const step = view.scale > 1.2 ? 10 : view.scale > 0.35 ? 50 : 100
    return step
  }, [view.scale])
  const chainPreview = tool === 'wall' && chain.length && hover ? snapAngle(chain[chain.length - 1], snapPoint(hover, data.walls, GRID, tol), keys.current.shift) : null
  const room = drag.current?.kind === 'room' ? drag.current : null

  return (
    <svg
      ref={svg}
      className={`plan tool-${tool}`}
      viewBox={vb}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onDoubleClick={() => chain.length && finishChain()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id="pg-minor" width={grid} height={grid} patternUnits="userSpaceOnUse">
          <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="var(--plan-grid)" strokeWidth={px(1)} />
        </pattern>
        <pattern id="pg-major" width={grid * 10} height={grid * 10} patternUnits="userSpaceOnUse">
          <rect width={grid * 10} height={grid * 10} fill="url(#pg-minor)" />
          <path d={`M ${grid * 10} 0 L 0 0 0 ${grid * 10}`} fill="none" stroke="var(--plan-grid-major)" strokeWidth={px(1)} />
        </pattern>
        {MATERIALS.map((m) => (
          <pattern key={m.id} id={`mat-${m.id}`} width={m.pattern === 'tiles' ? 40 : 160} height={m.pattern === 'tiles' ? 40 : 20} patternUnits="userSpaceOnUse">
            <rect width="200" height="200" fill={m.color} opacity={0.55} />
            {m.pattern === 'planks' && <path d="M0 20 H160 M80 0 V20" stroke="#00000014" strokeWidth={1} />}
            {m.pattern === 'tiles' && <path d="M40 0 V40 M0 40 H40" stroke="#00000018" strokeWidth={1} />}
            {m.pattern === 'herringbone' && <path d="M0 20 L20 0 M40 20 L60 0 M80 20 L100 0 M120 20 L140 0 M20 0 L40 20 M60 0 L80 20 M100 0 L120 20 M140 0 L160 20" stroke="#00000018" strokeWidth={1} />}
          </pattern>
        ))}
      </defs>
      <rect x={view.x} y={view.y} width={size.w / view.scale} height={size.h / view.scale} fill="url(#pg-major)" />

      {/* sols */}
      {data.floors.map((f) => (
        <g key={f.id}>
          <polygon points={f.points.map((p) => `${p.x},${p.y}`).join(' ')} fill={`url(#mat-${f.material})`} stroke={sel?.id === f.id ? 'var(--accent)' : 'none'} strokeWidth={px(2)} />
          {(() => {
            const c = polygonCentroid(f.points)
            return (
              <text x={c.x} y={c.y} className="plan-room-label" fontSize={px(13)} textAnchor="middle">
                <tspan x={c.x}>{f.name}</tspan>
                <tspan x={c.x} dy={px(16)} className="plan-room-area">{(polygonArea(f.points) / 10000).toFixed(1).replace('.', ',')} m²</tspan>
              </text>
            )
          })()}
          {sel?.id === f.id && f.points.map((p, i) => <rect key={i} x={p.x - px(5)} y={p.y - px(5)} width={px(10)} height={px(10)} fill="#fff" stroke="var(--accent)" strokeWidth={px(1.5)} />)}
        </g>
      ))}

      {/* meubles */}
      {data.furniture.map((f) => (
        <FurnitureTop key={f.id} f={f} selected={sel?.id === f.id} px={px} />
      ))}

      {/* murs */}
      {data.walls.map((w) => (
        <WallShape key={w.id} w={w} openings={data.openings.filter((o) => o.wallId === w.id)} selected={sel?.id === w.id} selOpening={sel?.kind === 'opening' ? sel.id : null} px={px} />
      ))}

      {/* cotations des murs */}
      {data.walls.map((w) => (
        <Dimension key={'d' + w.id} a={w.a} b={w.b} offset={w.thickness / 2 + px(14)} px={px} strong={sel?.id === w.id} />
      ))}

      {/* lumières */}
      {data.lights.map((l) => (
        <g key={l.id} transform={`translate(${l.x} ${l.y})`} className="plan-light">
          <circle r={px(9)} fill={l.color} stroke={sel?.id === l.id ? 'var(--accent)' : '#b08a3a'} strokeWidth={px(sel?.id === l.id ? 2.5 : 1.5)} />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4
            return <line key={i} x1={Math.cos(a) * px(12)} y1={Math.sin(a) * px(12)} x2={Math.cos(a) * px(16)} y2={Math.sin(a) * px(16)} stroke="#b08a3a" strokeWidth={px(1.5)} />
          })}
        </g>
      ))}

      {/* outils en cours */}
      {chain.length > 0 && (
        <g>
          <polyline points={[...chain, ...(chainPreview ? [chainPreview] : [])].map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={12} strokeOpacity={0.45} strokeLinejoin="round" />
          {chain.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={px(4)} fill="var(--accent)" />)}
          {chainPreview && <Dimension a={chain[chain.length - 1]} b={chainPreview} offset={px(18)} px={px} strong />}
        </g>
      )}
      {room && (
        <g>
          <rect x={Math.min(room.a.x, room.b.x)} y={Math.min(room.a.y, room.b.y)} width={Math.abs(room.b.x - room.a.x)} height={Math.abs(room.b.y - room.a.y)} fill="var(--accent-wash)" stroke="var(--accent)" strokeWidth={px(2)} />
          <Dimension a={{ x: Math.min(room.a.x, room.b.x), y: Math.min(room.a.y, room.b.y) }} b={{ x: Math.max(room.a.x, room.b.x), y: Math.min(room.a.y, room.b.y) }} offset={px(18)} px={px} strong />
          <Dimension a={{ x: Math.max(room.a.x, room.b.x), y: Math.min(room.a.y, room.b.y) }} b={{ x: Math.max(room.a.x, room.b.x), y: Math.max(room.a.y, room.b.y) }} offset={px(18)} px={px} strong />
        </g>
      )}
      {hover && (tool === 'wall' || tool === 'room') && !chain.length && (() => {
        const p = snapPoint(hover, data.walls, GRID, tol)
        return <circle cx={p.x} cy={p.y} r={px(4)} fill="var(--accent)" />
      })()}
      {hover && tool === 'furniture' && placing && (() => {
        const c = catalogItem(placing)!
        return <rect x={hover.x - c.w / 2} y={hover.y - c.d / 2} width={c.w} height={c.d} rx={4} fill={c.color} opacity={0.5} stroke="var(--accent)" strokeWidth={px(1.5)} strokeDasharray={`${px(4)} ${px(3)}`} />
      })()}
      {/* échelle */}
      <g transform={`translate(${view.x + px(20)} ${view.y + size.h / view.scale - px(24)})`}>
        <line x1={0} x2={100} y1={0} y2={0} stroke="var(--ink-soft)" strokeWidth={px(2)} />
        <line x1={0} x2={0} y1={-px(4)} y2={px(4)} stroke="var(--ink-soft)" strokeWidth={px(2)} />
        <line x1={100} x2={100} y1={-px(4)} y2={px(4)} stroke="var(--ink-soft)" strokeWidth={px(2)} />
        <text x={50} y={-px(7)} fontSize={px(11)} textAnchor="middle" fill="var(--ink-soft)">1 m</text>
      </g>
    </svg>
  )
}

const rotHandle = (f: Furniture): Pt => {
  const r = (f.rotation * Math.PI) / 180
  const d = f.d / 2 + 30
  return { x: f.x + Math.sin(r) * d, y: f.y - Math.cos(r) * d }
}

function Dimension({ a, b, offset, px, strong }: { a: Pt; b: Pt; offset: number; px: (n: number) => number; strong?: boolean }) {
  const L = dist(a, b)
  if (L < 5) return null
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const nx = -Math.sin(ang) * offset
  const ny = Math.cos(ang) * offset
  const A = { x: a.x + nx, y: a.y + ny }
  const B = { x: b.x + nx, y: b.y + ny }
  const m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
  let deg = (ang * 180) / Math.PI
  if (deg > 90 || deg < -90) deg += 180
  return (
    <g className={`plan-dim ${strong ? 'strong' : ''}`} pointerEvents="none">
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} strokeWidth={px(1)} />
      <line x1={A.x - Math.cos(ang + Math.PI / 4) * px(5)} y1={A.y - Math.sin(ang + Math.PI / 4) * px(5)} x2={A.x + Math.cos(ang + Math.PI / 4) * px(5)} y2={A.y + Math.sin(ang + Math.PI / 4) * px(5)} strokeWidth={px(1)} />
      <line x1={B.x - Math.cos(ang + Math.PI / 4) * px(5)} y1={B.y - Math.sin(ang + Math.PI / 4) * px(5)} x2={B.x + Math.cos(ang + Math.PI / 4) * px(5)} y2={B.y + Math.sin(ang + Math.PI / 4) * px(5)} strokeWidth={px(1)} />
      <g transform={`translate(${m.x} ${m.y}) rotate(${deg})`}>
        <rect x={-px(26)} y={-px(8)} width={px(52)} height={px(14)} rx={px(3)} className="plan-dim-bg" />
        <text y={px(3)} fontSize={px(10.5)} textAnchor="middle">{cm(L)}</text>
      </g>
    </g>
  )
}

function WallShape({ w, openings, selected, selOpening, px }: { w: Wall; openings: Opening[]; selected: boolean; selOpening: string | null; px: (n: number) => number }) {
  const L = wallLength(w)
  const ang = (wallAngle(w) * 180) / Math.PI
  const T = w.thickness
  // segments pleins entre les ouvertures
  const ops = [...openings].sort((a, b) => a.t - b.t)
  const solids: [number, number][] = []
  let cur = 0
  for (const o of ops) {
    const s = o.t * L - o.width / 2
    if (s > cur) solids.push([cur, s])
    cur = Math.max(cur, o.t * L + o.width / 2)
  }
  if (cur < L) solids.push([cur, L])
  return (
    <g transform={`translate(${w.a.x} ${w.a.y}) rotate(${ang})`}>
      {solids.map(([s, e], i) => (
        <rect key={i} x={s} y={-T / 2} width={e - s} height={T} className={`plan-wall ${selected ? 'sel' : ''}`} />
      ))}
      {ops.map((o) => {
        const s = o.t * L - o.width / 2
        const sel = selOpening === o.id
        if (o.kind === 'window')
          return (
            <g key={o.id} className={`plan-window ${sel ? 'sel' : ''}`}>
              <rect x={s} y={-T / 2} width={o.width} height={T} />
              <line x1={s} x2={s + o.width} y1={-T / 6} y2={-T / 6} strokeWidth={px(1.2)} />
              <line x1={s} x2={s + o.width} y1={T / 6} y2={T / 6} strokeWidth={px(1.2)} />
            </g>
          )
        const hingeX = o.flip ? s + o.width : s
        const dir = o.flip ? -1 : 1
        return (
          <g key={o.id} className={`plan-door ${sel ? 'sel' : ''}`}>
            <rect x={s} y={-T / 2} width={o.width} height={T} className="plan-door-gap" />
            <line x1={hingeX} y1={T / 2} x2={hingeX} y2={T / 2 + o.width} strokeWidth={px(2)} />
            <path d={`M ${hingeX} ${T / 2 + o.width} A ${o.width} ${o.width} 0 0 ${dir > 0 ? 0 : 1} ${hingeX + dir * o.width} ${T / 2}`} fill="none" strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(3)}`} />
          </g>
        )
      })}
    </g>
  )
}

function FurnitureTop({ f, selected, px }: { f: Furniture; selected: boolean; px: (n: number) => number }) {
  const { w, d } = f
  const detail = (() => {
    switch (f.type) {
      case 'bed':
      case 'bedsingle':
        return (
          <>
            <rect x={-w / 2 + 6} y={-d / 2 + 8} width={f.type === 'bed' ? w / 2 - 10 : w - 12} height={30} rx={6} className="ft-soft" />
            {f.type === 'bed' && <rect x={4} y={-d / 2 + 8} width={w / 2 - 10} height={30} rx={6} className="ft-soft" />}
            <rect x={-w / 2} y={-d / 2 + 50} width={w} height={d - 50} rx={4} className="ft-cover" />
          </>
        )
      case 'sofa':
      case 'armchair':
        return (
          <>
            <rect x={-w / 2} y={-d / 2} width={w} height={d * 0.25} rx={4} className="ft-dark" />
            <rect x={-w / 2} y={-d / 2} width={Math.min(18, w * 0.15)} height={d} rx={4} className="ft-dark" />
            <rect x={w / 2 - Math.min(18, w * 0.15)} y={-d / 2} width={Math.min(18, w * 0.15)} height={d} rx={4} className="ft-dark" />
          </>
        )
      case 'table':
      case 'coffee':
      case 'desk':
        return <rect x={-w / 2 + 4} y={-d / 2 + 4} width={w - 8} height={d - 8} rx={3} className="ft-line" />
      case 'chair':
      case 'officechair':
        return <rect x={-w / 2} y={-d / 2} width={w} height={8} rx={3} className="ft-dark" />
      case 'plant':
        return <circle r={Math.min(w, d) / 2} className="ft-plant" />
      case 'lamp':
        return <circle r={Math.min(w, d) / 2.4} className="ft-soft" />
      case 'bathtub':
        return <rect x={-w / 2 + 8} y={-d / 2 + 8} width={w - 16} height={d - 16} rx={20} className="ft-line" />
      case 'sink':
        return <ellipse cx={0} cy={4} rx={w / 3} ry={d / 4} className="ft-line" />
      case 'wc':
        return <ellipse cx={0} cy={d / 6} rx={w / 2.4} ry={d / 3} className="ft-line" />
      case 'shower':
        return <path d={`M ${-w / 2} ${-d / 2} L ${w / 2} ${d / 2} M ${w / 2} ${-d / 2} L ${-w / 2} ${d / 2}`} className="ft-line" />
      case 'piano':
        return <rect x={-w / 2 + 4} y={0} width={w - 8} height={d / 2 - 4} className="ft-keys" />
      default:
        return null
    }
  })()
  const rot = rotHandle(f)
  return (
    <g>
      <g transform={`translate(${f.x} ${f.y}) rotate(${f.rotation})`} className={`plan-furn ${selected ? 'sel' : ''} ${f.type === 'rug' ? 'rug' : ''}`}>
        <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={f.type === 'rug' ? 2 : 5} fill={f.color} strokeWidth={px(selected ? 2 : 1)} />
        {detail}
        <text y={px(4)} fontSize={px(10)} textAnchor="middle" className="plan-furn-label" transform={`rotate(${-f.rotation})`}>
          {f.label || catalogItem(f.type)?.name}
        </text>
      </g>
      {selected && (
        <g>
          <line x1={f.x} y1={f.y} x2={rot.x} y2={rot.y} stroke="var(--accent)" strokeWidth={px(1)} />
          <circle cx={rot.x} cy={rot.y} r={px(7)} fill="#fff" stroke="var(--accent)" strokeWidth={px(1.5)} className="plan-rot" />
        </g>
      )}
    </g>
  )
}

export { CATALOG }
export type { Floor }
