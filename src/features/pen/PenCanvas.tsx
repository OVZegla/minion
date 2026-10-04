import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { type Anchor, type Pt, type VPath, clonePath, constrain45, dist, insertAnchor, mirror, nearestOnPath, toSvg } from './bezier'

export type PenTool = 'pen' | 'direct'

type Drag =
  | { kind: 'new'; index: number; start: Pt; alt: boolean; frozenIn: Pt | null; spaceFrom: Pt | null; anchorStart: Pt; moved: boolean }
  | { kind: 'close'; start: Pt; moved: boolean }
  | { kind: 'anchor'; index: number; start: Pt; orig: Anchor; moved: boolean }
  | { kind: 'handle'; index: number; which: 'hIn' | 'hOut'; alt: boolean }
  | { kind: 'convert'; index: number; start: Pt; moved: boolean }

interface Props {
  width: number
  height: number
  value: VPath
  onChange: (p: VPath) => void
  tool: PenTool
  setTool: (t: PenTool) => void
  /** calques décoratifs sous le tracé (cible, image modèle…) */
  under?: ReactNode
  over?: ReactNode
  onCommit?: (p: VPath) => void
  stroke?: string
  fill?: string
  showRubberBand?: boolean
  /** fond blanc (atelier) ou transparent (studio) */
  background?: string | null
  /** Ctrl+Z géré ici (atelier) ou par l'historique de l'application hôte (studio) */
  undoKeys?: boolean
  /** P / A changent d'outil ici (atelier) ou dans l'application hôte */
  toolKeys?: boolean
  className?: string
  style?: React.CSSProperties
}

const HIT = 9

/**
 * Outil plume fidèle à Photoshop :
 * clic = point d'angle · clic-glisser = point lisse · Maj = 45° · Alt = casser les poignées
 * Ctrl = sélection directe temporaire · clic sur le 1er point = fermer · Ctrl+Z = annuler
 * Échap / Entrée = terminer · clic sur le dernier point = reprendre.
 */
export function PenCanvas({ width, height, value, onChange, tool, setTool, under, over, onCommit, stroke = '#2f80ed', fill = 'none', showRubberBand = true, background = '#fff', undoKeys = true, toolKeys = true, className = 'pen-svg', style }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const [drawing, setDrawing] = useState(false) // un tracé ouvert est en cours
  const [sel, setSel] = useState<number | null>(null)
  const [hover, setHover] = useState<Pt | null>(null)
  const [mods, setMods] = useState({ ctrl: false, alt: false, shift: false, space: false })
  const past = useRef<VPath[]>([])
  const future = useRef<VPath[]>([])
  const valueRef = useRef(value)
  valueRef.current = value

  const effTool: PenTool = mods.ctrl ? 'direct' : tool
  const n = value.anchors.length

  const push = (before: VPath) => {
    past.current.push(clonePath(before))
    if (past.current.length > 200) past.current.shift()
    future.current = []
  }
  const commit = (p: VPath) => {
    onChange(p)
    onCommit?.(p)
  }

  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const m = svg.current!.getScreenCTM()!.inverse()
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    return { x: pt.x, y: pt.y }
  }

  /* ---------- clavier ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      setMods({ ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, space: e.code === 'Space' || mods.space })
      if (e.key === 'Alt') e.preventDefault()
      if (e.code === 'Space') {
        e.preventDefault()
        // Espace pendant le glisser d'un nouveau point : déplace le point (comme Photoshop)
        const d = drag.current
        if (d?.kind === 'new' && !d.spaceFrom && hover) d.spaceFrom = hover
      }
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !undoKeys) return
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        const prev = past.current.pop()
        if (prev) {
          future.current.push(clonePath(valueRef.current))
          const wasClosed = valueRef.current.closed
          commit(prev)
          // annuler une fermeture reprend le tracé ; sinon on reste dans l'état courant
          const keepDrawing = !prev.closed && prev.anchors.length > 0 && (drawing || wasClosed)
          setDrawing(keepDrawing)
          setSel(keepDrawing ? prev.anchors.length - 1 : null)
        }
        return
      }
      if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault()
        const next = future.current.pop()
        if (next) {
          past.current.push(clonePath(valueRef.current))
          commit(next)
        }
        return
      }
      if (ctrl) return
      if (e.key === 'Escape' || e.key === 'Enter') {
        setDrawing(false)
        setSel(null)
      } else if (toolKeys && e.key.toLowerCase() === 'p' && !e.altKey) setTool('pen')
      else if (toolKeys && e.key.toLowerCase() === 'a' && !e.altKey) setTool('direct')
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel != null && effTool === 'direct') {
        e.preventDefault()
        removeAnchor(sel)
      }
    }
    const up = (e: KeyboardEvent) => setMods({ ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, space: e.code === 'Space' ? false : mods.space })
    const blur = () => setMods({ ctrl: false, alt: false, shift: false, space: false })
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  })

  const removeAnchor = (i: number) => {
    push(value)
    const anchors = value.anchors.filter((_, k) => k !== i)
    commit({ anchors, closed: value.closed && anchors.length > 2 })
    setSel(null)
    if (!anchors.length) setDrawing(false)
  }

  /* ---------- détection ---------- */
  const hitAnchor = (p: Pt) => value.anchors.findIndex((a) => dist(a, p) <= HIT)
  const hitHandle = (p: Pt): { index: number; which: 'hIn' | 'hOut' } | null => {
    const visible = visibleHandles()
    for (const i of visible) {
      const a = value.anchors[i]
      if (a.hOut && dist(a.hOut, p) <= HIT) return { index: i, which: 'hOut' }
      if (a.hIn && dist(a.hIn, p) <= HIT) return { index: i, which: 'hIn' }
    }
    return null
  }
  /** Poignées affichées : point sélectionné et ses voisins (comme Photoshop), ou dernier point en cours de tracé. */
  const visibleHandles = () => {
    const out = new Set<number>()
    const add = (i: number) => {
      if (i < 0 || i >= n) return
      out.add(i)
      if (i > 0 || value.closed) out.add((i - 1 + n) % n)
      if (i < n - 1 || value.closed) out.add((i + 1) % n)
    }
    if (sel != null) add(sel)
    if (drawing && n) out.add(n - 1)
    return [...out]
  }

  /* ---------- pointeur ---------- */
  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toWorld(e)
    const v = value

    if (effTool === 'direct') {
      const h = hitHandle(p)
      if (h) {
        push(v)
        drag.current = { kind: 'handle', index: h.index, which: h.which, alt: e.altKey }
        return
      }
      const i = hitAnchor(p)
      if (i >= 0) {
        setSel(i)
        push(v)
        if (e.altKey) drag.current = { kind: 'convert', index: i, start: p, moved: false }
        else drag.current = { kind: 'anchor', index: i, start: p, orig: { ...v.anchors[i] }, moved: false }
        return
      }
      setSel(null)
      return
    }

    // ----- plume -----
    const i = hitAnchor(p)
    // Alt sur une poignée : la déplacer seule (outil conversion)
    if (e.altKey) {
      const h = hitHandle(p)
      if (h) {
        push(v)
        drag.current = { kind: 'handle', index: h.index, which: h.which, alt: true }
        return
      }
      if (i >= 0) {
        push(v)
        setSel(i)
        drag.current = { kind: 'convert', index: i, start: p, moved: false }
        return
      }
    }
    if (drawing && !v.closed) {
      // fermer le tracé
      if (i === 0 && n >= 2) {
        push(v)
        drag.current = { kind: 'close', start: p, moved: false }
        commit({ ...v, closed: true })
        return
      }
      // Alt-clic sur le dernier point : coupe la poignée sortante
      if (i === n - 1 && e.altKey) {
        push(v)
        commit({ ...v, anchors: v.anchors.map((a, k) => (k === i ? { ...a, hOut: null } : a)) })
        return
      }
    } else {
      // reprendre un tracé ouvert depuis son dernier point
      if (!v.closed && n && i === n - 1) {
        setDrawing(true)
        setSel(i)
        return
      }
      // ajout / suppression automatiques de points sur le tracé existant
      if (n >= 2) {
        if (i > 0 && i < n - 1) {
          removeAnchor(i)
          return
        }
        if (i >= 0 && v.closed) {
          removeAnchor(i)
          return
        }
        const near = nearestOnPath(v, p)
        if (near.d <= HIT) {
          push(v)
          commit(insertAnchor(v, near.seg, near.t))
          setSel(near.seg + 1)
          return
        }
      }
      // un seul tracé dans cet espace : on ne remplace pas le tracé existant
      if (n) return
    }

    // nouveau point
    push(v)
    let pos = p
    if (e.shiftKey && drawing && n) pos = constrain45(v.anchors[n - 1], p)
    const anchor: Anchor = { x: pos.x, y: pos.y, hIn: null, hOut: null }
    const base = drawing ? v : { anchors: [], closed: false }
    const next = { ...base, anchors: [...base.anchors, anchor] }
    onChange(next)
    setDrawing(true)
    setSel(next.anchors.length - 1)
    drag.current = { kind: 'new', index: next.anchors.length - 1, start: pos, alt: false, frozenIn: null, spaceFrom: null, anchorStart: pos, moved: false }
  }

  const onMove = (e: RPointerEvent) => {
    const p = toWorld(e)
    setHover(p)
    const d = drag.current
    if (!d) return
    const v = valueRef.current
    const set = (i: number, a: Partial<Anchor>) => onChange({ ...v, anchors: v.anchors.map((x, k) => (k === i ? { ...x, ...a } : x)) })

    if (d.kind === 'new') {
      const a = v.anchors[d.index]
      if (mods.space) {
        // déplace le point avec ses poignées
        if (!d.spaceFrom) d.spaceFrom = p
        const dx = p.x - d.spaceFrom.x
        const dy = p.y - d.spaceFrom.y
        d.spaceFrom = p
        set(d.index, { x: a.x + dx, y: a.y + dy, hIn: a.hIn && { x: a.hIn.x + dx, y: a.hIn.y + dy }, hOut: a.hOut && { x: a.hOut.x + dx, y: a.hOut.y + dy } })
        return
      }
      if (!d.moved && dist(p, d.start) < 3) return
      d.moved = true
      let h = p
      if (e.shiftKey) h = constrain45(a, p)
      if (e.altKey && !d.alt) {
        d.alt = true
        d.frozenIn = a.hIn ?? mirror(h, a)
      }
      set(d.index, { hOut: h, hIn: d.alt ? d.frozenIn : mirror(h, a) })
      return
    }
    if (d.kind === 'close') {
      if (!d.moved && dist(p, d.start) < 3) return
      d.moved = true
      const a = v.anchors[0]
      const h = e.shiftKey ? constrain45(a, p) : p
      // glisser en fermant : règle la poignée d'arrivée, symétrique de la sortie (sauf Alt)
      set(0, e.altKey ? { hIn: mirror(h, a) } : { hOut: h, hIn: mirror(h, a) })
      return
    }
    if (d.kind === 'anchor') {
      if (!d.moved && dist(p, d.start) < 2) return
      d.moved = true
      let dx = p.x - d.start.x
      let dy = p.y - d.start.y
      if (e.shiftKey) {
        const c = constrain45(d.start, p)
        dx = c.x - d.start.x
        dy = c.y - d.start.y
      }
      const o = d.orig
      set(d.index, { x: o.x + dx, y: o.y + dy, hIn: o.hIn && { x: o.hIn.x + dx, y: o.hIn.y + dy }, hOut: o.hOut && { x: o.hOut.x + dx, y: o.hOut.y + dy } })
      return
    }
    if (d.kind === 'handle') {
      const a = v.anchors[d.index]
      const h = e.shiftKey ? constrain45(a, p) : p
      const other = d.which === 'hIn' ? 'hOut' : 'hIn'
      const o = a[other]
      const independent = d.alt || e.altKey || !o || !isSmooth(a)
      if (independent) set(d.index, { [d.which]: h })
      else {
        // garde les poignées alignées (point lisse), en conservant la longueur de l'autre
        const len = dist(o!, a)
        const ang = Math.atan2(a.y - h.y, a.x - h.x)
        set(d.index, { [d.which]: h, [other]: { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len } })
      }
      return
    }
    if (d.kind === 'convert') {
      if (!d.moved && dist(p, d.start) < 3) return
      d.moved = true
      const a = v.anchors[d.index]
      const h = e.shiftKey ? constrain45(a, p) : p
      set(d.index, { hOut: h, hIn: mirror(h, a) })
    }
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const v = valueRef.current
    if (d.kind === 'convert' && !d.moved) {
      // Alt-clic sur un point : le transforme en point d'angle
      commit({ ...v, anchors: v.anchors.map((a, k) => (k === d.index ? { ...a, hIn: null, hOut: null } : a)) })
      return
    }
    if (d.kind === 'anchor' && !d.moved) {
      past.current.pop()
      return
    }
    if (d.kind === 'close') {
      setDrawing(false)
      setSel(null)
    }
    commit(v)
  }

  /* ---------- curseur (comme la plume Photoshop) ---------- */
  let cursorBadge = ''
  if (effTool === 'pen' && hover) {
    const i = hitAnchor(hover)
    if (mods.alt) cursorBadge = '^'
    else if (drawing && i === 0 && n >= 2) cursorBadge = 'o'
    else if (!drawing && !value.closed && n && i === n - 1) cursorBadge = '/'
    else if (!drawing && n >= 2 && i > 0 && (i < n - 1 || value.closed)) cursorBadge = '−'
    else if (!drawing && n >= 2 && i < 0 && nearestOnPath(value, hover).d <= HIT) cursorBadge = '+'
    else if (!drawing && !n) cursorBadge = '×'
  }
  const cursor = effTool === 'direct' ? directCursor : penCursor(cursorBadge)

  const last = n ? value.anchors[n - 1] : null
  const handles = visibleHandles()

  return (
    <svg
      ref={svg}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      style={{ cursor, ...style }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
    >
      {background ? <rect width={width} height={height} fill={background} /> : <rect width={width} height={height} fill="transparent" />}
      {under}
      {/* tracé */}
      <path d={toSvg(value)} fill={value.closed ? fill : 'none'} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
      {/* aperçu du segment suivant (« élastique ») */}
      {showRubberBand && drawing && last && hover && effTool === 'pen' && !drag.current && (
        <path
          d={`M ${last.x} ${last.y} C ${(last.hOut ?? last).x} ${(last.hOut ?? last).y} ${(mods.shift ? constrain45(last, hover) : hover).x} ${(mods.shift ? constrain45(last, hover) : hover).y} ${(mods.shift ? constrain45(last, hover) : hover).x} ${(mods.shift ? constrain45(last, hover) : hover).y}`}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.6}
          pointerEvents="none"
        />
      )}
      {/* poignées */}
      {handles.map((i) => {
        const a = value.anchors[i]
        return (
          <g key={'h' + i} pointerEvents="none">
            {a.hIn && <line x1={a.x} y1={a.y} x2={a.hIn.x} y2={a.hIn.y} stroke={stroke} strokeWidth={1} />}
            {a.hOut && <line x1={a.x} y1={a.y} x2={a.hOut.x} y2={a.hOut.y} stroke={stroke} strokeWidth={1} />}
            {a.hIn && <circle cx={a.hIn.x} cy={a.hIn.y} r={3.5} fill={stroke} />}
            {a.hOut && <circle cx={a.hOut.x} cy={a.hOut.y} r={3.5} fill={stroke} />}
          </g>
        )
      })}
      {/* points d'ancrage : carrés pleins = sélectionnés, creux = non sélectionnés (comme Photoshop) */}
      {value.anchors.map((a, i) => {
        const active = sel === i || (drawing && i === n - 1)
        return <rect key={i} x={a.x - 4} y={a.y - 4} width={8} height={8} fill={active ? stroke : '#fff'} stroke={stroke} strokeWidth={1.2} pointerEvents="none" />
      })}
      {over}
    </svg>
  )
}

export const isSmooth = (a: Anchor) => {
  if (!a.hIn || !a.hOut) return false
  const a1 = Math.atan2(a.hIn.y - a.y, a.hIn.x - a.x)
  const a2 = Math.atan2(a.hOut.y - a.y, a.hOut.x - a.x)
  let diff = Math.abs(a1 - a2) % (2 * Math.PI)
  if (diff > Math.PI) diff = 2 * Math.PI - diff
  return Math.abs(diff - Math.PI) < 0.08
}

/* Curseurs dessinés pour Minion, inspirés de la plume de Photoshop */
function penCursor(badge: string) {
  const svgStr = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>
    <path d='M3 3 L9 17 L12 14 L17 19 L19 17 L14 12 L17 9 Z' fill='white' stroke='black' stroke-width='1.2' stroke-linejoin='round'/>
    <circle cx='9.5' cy='9.5' r='1.3' fill='black'/>
    ${badge ? `<text x='18' y='26' font-family='Arial' font-size='11' font-weight='bold' fill='black' stroke='white' stroke-width='2.5' paint-order='stroke'>${badge}</text>` : ''}
  </svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svgStr)}") 3 3, crosshair`
}
const directCursor = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4 3 L4 19 L8.5 15 L11.5 21 L14 20 L11 14 L17 14 Z' fill='white' stroke='black' stroke-width='1.3' stroke-linejoin='round'/></svg>`)}") 4 3, default`
