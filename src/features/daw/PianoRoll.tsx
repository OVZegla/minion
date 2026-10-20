import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { noteName } from '../synth/music'
import { getInstrument, getKit, kitPads, PADS } from './bank'
import { usePlayhead } from './controls'
import type { Engine } from './engine'
import type { Clip, MidiNote, Track } from './types'

const ROW = 14
const ROW_DRUM = 24
const LOW = 21
const HIGH = 108
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12)
const uid = () => crypto.randomUUID()

interface Props {
  clip: Clip
  track: Track
  bpm: number
  bpb: number
  snap: number
  engine: Engine
  onChange: (c: Clip, merge?: string) => void
}

type Drag =
  | { kind: 'move'; x: number; y: number; orig: MidiNote[]; ids: Set<string>; moved: boolean; hit: string }
  | { kind: 'resize'; x: number; orig: MidiNote[]; ids: Set<string> }
  | { kind: 'box'; x: number; y: number; x2: number; y2: number; add: boolean }
  | { kind: 'vel'; ids: Set<string> }
  | { kind: 'paint'; p: number; erase: boolean; cur: MidiNote[] }

export function PianoRoll({ clip, track, bpm, bpb, snap, engine, onChange }: Props) {
  void bpm
  const drums = track.kind === 'drums'
  const kit = drums ? getKit(track.instrument) : undefined
  const notes = clip.notes ?? []
  const len = clip.length ?? 4
  const scroller = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [ppb, setPpb] = useState(0)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [tool, setTool] = useState<'draw' | 'select'>('draw')
  const [lastLen, setLastLen] = useState(drums ? 0.25 : 1)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const drag = useRef<Drag | null>(null)
  const grid = snap || 0.25

  /* lignes : notes du clavier ou pads de batterie */
  const rows = useMemo(() => {
    if (drums) {
      const pads = kit ? kitPads(kit) : PADS
      const used = new Set(notes.map((n) => n.p))
      const list = pads.map((p) => ({ p: p.p, label: p.name }))
      for (const p of used) if (!list.some((r) => r.p === p)) list.push({ p, label: PADS.find((x) => x.p === p)?.name ?? `Note ${p}` })
      return list
    }
    const out = []
    for (let p = HIGH; p >= LOW; p--) out.push({ p, label: noteName(p) })
    return out
  }, [drums, kit, notes])
  const rowH = drums ? ROW_DRUM : ROW
  const rowOf = (p: number) => rows.findIndex((r) => r.p === p)

  // zoom initial : le clip remplit la largeur
  useLayoutEffect(() => {
    const w = (wrap.current?.clientWidth ?? 800) - 70
    setPpb(Math.max(18, Math.min(160, w / Math.max(4, len))))
    setSel(new Set())
    // centrer verticalement sur les notes
    if (!drums && scroller.current) {
      const ps = notes.map((n) => n.p)
      const low = /Basse/.test(getInstrument(track.instrument)?.cat ?? '')
      const mid = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : low ? 41 : 62
      scroller.current.scrollTop = (HIGH - mid) * ROW - scroller.current.clientHeight / 2
    }
  }, [clip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const playhead = useRef<HTMLDivElement>(null)
  usePlayhead(playhead, ppb, -clip.start * ppb)

  const width = Math.max(len, 1) * ppb
  const height = rows.length * rowH

  const set = (ns: MidiNote[], merge?: string) => onChange({ ...clip, notes: ns }, merge)
  const q = (t: number) => (snap ? Math.round(t / snap) * snap : t)
  const qFloor = (t: number) => (snap ? Math.floor(t / snap + 1e-6) * snap : t)

  const audition = (p: number, v = 0.8) => {
    engine.noteOn(track.id, p, v)
    setTimeout(() => engine.noteOff(track.id, p), 220)
  }

  const local = (e: { clientX: number; clientY: number }) => {
    const r = scroller.current!.getBoundingClientRect()
    return { x: e.clientX - r.left + scroller.current!.scrollLeft, y: e.clientY - r.top + scroller.current!.scrollTop }
  }

  const onGridDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    wrap.current?.focus()
    const { x, y } = local(e)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (tool === 'select' || e.shiftKey || e.ctrlKey) {
      drag.current = { kind: 'box', x, y, x2: x, y2: y, add: e.shiftKey || e.ctrlKey }
      if (!(e.shiftKey || e.ctrlKey)) setSel(new Set())
      return
    }
    const row = rows[Math.floor(y / rowH)]
    if (!row) return
    const t = qFloor(x / ppb)
    if (t >= len) return
    const n: MidiNote = { id: uid(), p: row.p, t, d: drums ? grid : lastLen, v: 0.8 }
    const next = [...notes, n]
    set(next, 'dpr-add')
    setSel(new Set([n.id]))
    audition(row.p)
    // batterie : on peint des pas en glissant ; mélodie : on allonge la note
    drag.current = drums ? { kind: 'paint', p: row.p, erase: false, cur: next } : { kind: 'resize', x: (t + n.d) * ppb, orig: next, ids: new Set([n.id]) }
  }

  const onNoteDown = (e: React.PointerEvent, n: MidiNote) => {
    if (e.button === 2) return
    e.stopPropagation()
    wrap.current?.focus()
    const { x, y } = local(e)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    let ids = sel
    if (e.shiftKey || e.ctrlKey) {
      ids = new Set(sel)
      if (ids.has(n.id)) ids.delete(n.id)
      else ids.add(n.id)
    } else if (!sel.has(n.id)) ids = new Set([n.id])
    setSel(ids)
    if (drums && !e.altKey && !e.shiftKey && !e.ctrlKey) {
      // batterie : cliquer un pas l'efface (et glisser efface les suivants)
      const next = notes.filter((m) => m.id !== n.id)
      set(next, 'dpr-erase')
      setSel(new Set())
      drag.current = { kind: 'paint', p: n.p, erase: true, cur: next }
      return
    }
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    let orig = notes
    if (e.altKey) {
      // Alt : duplique la sélection et déplace la copie
      const copies = notes.filter((m) => ids.has(m.id)).map((m) => ({ ...m, id: uid() }))
      orig = [...notes, ...copies]
      const map = new Set(copies.map((c) => c.id))
      ids = map
      setSel(map)
      set(orig, 'dpr-dup')
    }
    if (!drums && e.clientX > rect.right - 7) drag.current = { kind: 'resize', x, orig, ids }
    else drag.current = { kind: 'move', x, y, orig, ids, moved: false, hit: n.id }
    if (!drums) audition(n.p, n.v)
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const { x, y } = local(e)
    if (d.kind === 'box') {
      d.x2 = x
      d.y2 = y
      setBox({ x: Math.min(d.x, x), y: Math.min(d.y, y), w: Math.abs(x - d.x), h: Math.abs(y - d.y) })
      return
    }
    if (d.kind === 'paint') {
      const t = qFloor(x / ppb)
      if (t < 0 || t >= len) return
      const at = d.cur.find((m) => m.p === d.p && Math.abs(m.t - t) < 1e-6)
      if (d.erase && at) d.cur = d.cur.filter((m) => m !== at)
      else if (!d.erase && !at) d.cur = [...d.cur, { id: uid(), p: d.p, t, d: grid, v: 0.8 }]
      else return
      set(d.cur, d.erase ? 'dpr-erase' : 'dpr-add')
      return
    }
    if (d.kind === 'move') {
      const dt = q((x - d.x) / ppb)
      const dr = Math.round((y - d.y) / rowH)
      if (!d.moved && Math.abs(x - d.x) < 3 && Math.abs(y - d.y) < 3) return
      d.moved = true
      const out = d.orig.map((n) => {
        if (!d.ids.has(n.id)) return n
        const ri = rowOf(n.p) + dr
        const row = rows[Math.max(0, Math.min(rows.length - 1, ri))]
        return { ...n, t: Math.max(0, Math.min(len - 0.01, n.t + dt)), p: row.p }
      })
      set(out, 'dpr-move')
      return
    }
    if (d.kind === 'resize') {
      const dd = (x - d.x) / ppb
      const out = d.orig.map((n) => {
        if (!d.ids.has(n.id)) return n
        const end = snap ? Math.max(n.t + snap, Math.round((n.t + n.d + dd) / snap) * snap) : n.t + n.d + dd
        return { ...n, d: Math.max(snap || 0.0625, end - n.t) }
      })
      set(out, 'dpr-resize')
      const first = out.find((n) => d.ids.has(n.id))
      if (first) setLastLen(first.d)
    }
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'box') {
      const t0 = Math.min(d.x, d.x2) / ppb
      const t1 = Math.max(d.x, d.x2) / ppb
      const r0 = Math.floor(Math.min(d.y, d.y2) / rowH)
      const r1 = Math.floor(Math.max(d.y, d.y2) / rowH)
      const hit = notes.filter((n) => n.t + n.d > t0 && n.t < t1 && rowOf(n.p) >= r0 && rowOf(n.p) <= r1).map((n) => n.id)
      setSel((s) => new Set([...(d.add ? s : []), ...hit]))
      setBox(null)
    }
  }

  /* vélocités */
  const onVelDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { kind: 'vel', ids: new Set() }
    onVelMove(e)
  }
  const onVelMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.kind !== 'vel') return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - r.left + (scroller.current?.scrollLeft ?? 0)
    const v = Math.max(0.05, Math.min(1, 1 - (e.clientY - r.top) / r.height))
    const t = x / ppb
    const near = notes.filter((n) => Math.abs(n.t - t) < Math.max(0.12, 6 / ppb))
    if (!near.length) return
    const targets = sel.size && near.some((n) => sel.has(n.id)) ? new Set(near.filter((n) => sel.has(n.id)).map((n) => n.id)) : new Set(near.map((n) => n.id))
    set(notes.map((n) => (targets.has(n.id) ? { ...n, v } : n)), 'dpr-vel')
  }

  /* clavier */
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key
    const selected = notes.filter((n) => sel.has(n.id))
    const mod = e.ctrlKey || e.metaKey
    if ((k === 'Delete' || k === 'Backspace') && sel.size) {
      e.preventDefault()
      e.stopPropagation()
      set(notes.filter((n) => !sel.has(n.id)))
      setSel(new Set())
    } else if (mod && k.toLowerCase() === 'a') {
      e.preventDefault()
      e.stopPropagation()
      setSel(new Set(notes.map((n) => n.id)))
    } else if (mod && k.toLowerCase() === 'd' && sel.size) {
      e.preventDefault()
      e.stopPropagation()
      const end = Math.max(...selected.map((n) => n.t + n.d))
      const start = Math.min(...selected.map((n) => n.t))
      const shift = snap ? Math.ceil((end - start) / snap) * snap : end - start
      const copies = selected.map((n) => ({ ...n, id: uid(), t: n.t + shift })).filter((n) => n.t < len)
      set([...notes, ...copies])
      setSel(new Set(copies.map((c) => c.id)))
    } else if ((k === 'ArrowUp' || k === 'ArrowDown') && sel.size) {
      e.preventDefault()
      e.stopPropagation()
      const step = (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)
      if (drums) {
        set(notes.map((n) => (sel.has(n.id) ? { ...n, p: rows[Math.max(0, Math.min(rows.length - 1, rowOf(n.p) - Math.sign(step)))].p } : n)))
      } else set(notes.map((n) => (sel.has(n.id) ? { ...n, p: Math.max(LOW, Math.min(HIGH, n.p + step)) } : n)), 'dpr-arrow')
    } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && sel.size) {
      e.preventDefault()
      e.stopPropagation()
      const dt = (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? bpb : grid)
      set(notes.map((n) => (sel.has(n.id) ? { ...n, t: Math.max(0, Math.min(len - 0.01, n.t + dt)) } : n)), 'dpr-arrow')
    } else if (k === 'Escape') setSel(new Set())
  }

  /* actions de la barre */
  const target = sel.size ? notes.filter((n) => sel.has(n.id)) : notes
  const ids = new Set(target.map((n) => n.id))
  const quantize = () => set(notes.map((n) => (ids.has(n.id) ? { ...n, t: Math.min(len - grid, Math.round(n.t / grid) * grid), d: drums ? n.d : Math.max(grid, Math.round(n.d / grid) * grid) } : n)))
  const transpose = (st: number) => set(notes.map((n) => (ids.has(n.id) ? { ...n, p: Math.max(LOW, Math.min(HIGH, n.p + st)) } : n)))
  const humanize = () => set(notes.map((n) => (ids.has(n.id) ? { ...n, t: Math.max(0, n.t + (Math.random() - 0.5) * 0.03), v: Math.max(0.1, Math.min(1, n.v + (Math.random() - 0.5) * 0.18)) } : n)))
  const legato = () => {
    const sorted = [...target].sort((a, b) => a.t - b.t)
    const next = new Map<string, number>()
    sorted.forEach((n) => {
      const after = sorted.find((m) => m.t > n.t + 1e-4)
      next.set(n.id, (after ? after.t : len) - n.t)
    })
    set(notes.map((n) => (next.has(n.id) ? { ...n, d: next.get(n.id)! } : n)))
  }
  const setLen = (bars: number) => onChange({ ...clip, length: Math.max(0.25, bars) * bpb })

  // défilement horizontal synchronisé (règle)
  const ruler = useRef<HTMLDivElement>(null)
  const keys = useRef<HTMLDivElement>(null)
  const vel = useRef<HTMLDivElement>(null)
  const onScroll = () => {
    const s = scroller.current!
    if (ruler.current) ruler.current.style.transform = `translateX(${-s.scrollLeft}px)`
    if (vel.current) vel.current.style.transform = `translateX(${-s.scrollLeft}px)`
    if (keys.current) keys.current.style.transform = `translateY(${-s.scrollTop}px)`
  }
  useEffect(onScroll, [ppb])

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault()
      setPpb((p) => Math.max(8, Math.min(400, p * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
    }
  }

  const beats = Math.ceil(len)
  const gridStyle = {
    width,
    height,
    backgroundSize: `${ppb * bpb}px 100%, ${ppb}px 100%, ${ppb * grid}px 100%`,
  }

  return (
    <div className="dpr" ref={wrap} tabIndex={0} onKeyDown={onKey}>
      <div className="dpr-bar">
        <div className="dw-seg">
          <button className={tool === 'draw' ? 'on' : ''} onClick={() => setTool('draw')} title="Crayon : cliquer pour ajouter une note, glisser pour l’allonger">✏️ Crayon</button>
          <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')} title="Sélection : tracer un rectangle (ou Maj + glisser avec le crayon)">⬚ Sélection</button>
        </div>
        <button className="dw-btn" onClick={quantize} title="Aligner sur la grille">Quantifier</button>
        {!drums && (
          <>
            <button className="dw-btn" onClick={() => transpose(-12)} title="Une octave plus bas">−8ve</button>
            <button className="dw-btn" onClick={() => transpose(-1)} title="Un demi-ton plus bas">−½</button>
            <button className="dw-btn" onClick={() => transpose(1)} title="Un demi-ton plus haut">+½</button>
            <button className="dw-btn" onClick={() => transpose(12)} title="Une octave plus haut">+8ve</button>
            <button className="dw-btn" onClick={legato} title="Chaque note dure jusqu’à la suivante">Legato</button>
          </>
        )}
        <button className="dw-btn" onClick={humanize} title="Petites variations de place et de force, plus vivant">Humaniser</button>
        <span className="dw-sep" />
        <label className="dw-field" title="Longueur du clip">
          Longueur
          <select value={len / bpb} onChange={(e) => setLen(+e.target.value)}>
            {[...new Set([0.25, 0.5, 1, 2, 4, 8, 16, 32, Math.round((len / bpb) * 100) / 100])].sort((a, b) => a - b).map((b) => (
              <option key={b} value={b}>
                {b < 1 ? `${b * bpb} temps` : `${b} mesure${b > 1 ? 's' : ''}`}
              </option>
            ))}
          </select>
        </label>
        <span className="dw-faint">{sel.size ? `${sel.size} note${sel.size > 1 ? 's' : ''} sélectionnée${sel.size > 1 ? 's' : ''}` : `${notes.length} note${notes.length > 1 ? 's' : ''}`}</span>
        <span className="dw-hint">{drums ? 'Clic : poser ou retirer un coup · glisser pour en poser plusieurs' : 'Clic : note · bord droit : longueur · Alt : copier · Suppr · flèches · Ctrl + molette : zoom'}</span>
      </div>
      <div className={`dpr-body ${drums ? 'drums' : ''}`}>
        <div className="dpr-corner" />
        <div className="dpr-ruler-wrap">
          <div className="dpr-ruler" ref={ruler} style={{ width }}>
            {Array.from({ length: beats }, (_, b) => (
              <span key={b} className={b % bpb === 0 ? 'bar' : ''} style={{ left: b * ppb }}>
                {b % bpb === 0 ? Math.floor((clip.start + b) / bpb) + 1 : ppb > 30 ? `.${(b % bpb) + 1}` : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="dpr-keys-wrap">
          <div className="dpr-keys" ref={keys} style={{ height }}>
            {rows.map((r) => (
              <div
                key={r.p}
                className={`dpr-key ${drums ? 'pad' : isBlack(r.p) ? 'black' : 'white'} ${!drums && r.p % 12 === 0 ? 'c' : ''}`}
                style={{ height: rowH }}
                onPointerDown={() => engine.noteOn(track.id, r.p, 0.8)}
                onPointerUp={() => engine.noteOff(track.id, r.p)}
                onPointerLeave={() => engine.noteOff(track.id, r.p)}
              >
                {drums ? r.label : r.p % 12 === 0 ? r.label : ''}
              </div>
            ))}
          </div>
        </div>
        <div className="dpr-scroll" ref={scroller} onScroll={onScroll} onWheel={onWheel}>
          <div className={`dpr-grid ${drums ? 'drums' : ''}`} style={gridStyle} onPointerDown={onGridDown} onPointerMove={onMove} onPointerUp={onUp} onContextMenu={(e) => e.preventDefault()}>
            {rows.map((r, i) => (
              <div key={r.p} className={`dpr-row ${!drums && isBlack(r.p) ? 'black' : ''} ${!drums && r.p % 12 === 0 ? 'c' : ''}`} style={{ top: i * rowH, height: rowH }} />
            ))}
            {notes.map((n) => {
              const ri = rowOf(n.p)
              if (ri < 0) return null
              const out = n.t >= len
              return (
                <div
                  key={n.id}
                  className={`dpr-note ${sel.has(n.id) ? 'sel' : ''} ${out ? 'out' : ''}`}
                  style={{ left: n.t * ppb, top: ri * rowH + 1, width: Math.max(4, n.d * ppb - 1), height: rowH - 2, ['--v' as string]: n.v, background: track.color }}
                  onPointerDown={(e) => onNoteDown(e, n)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onDoubleClick={() => !drums && set(notes.filter((m) => m.id !== n.id))}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    set(notes.filter((m) => m.id !== n.id))
                  }}
                  title={drums ? undefined : `${noteName(n.p)} · force ${Math.round(n.v * 127)}`}
                >
                  {!drums && n.d * ppb > 34 && <span>{noteName(n.p)}</span>}
                </div>
              )
            })}
            {box && <div className="dpr-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
            <div className="dpr-end" style={{ left: len * ppb }} />
            <div className="dpr-playhead" ref={playhead} />
          </div>
        </div>
        <div className="dpr-vel-label">Force</div>
        <div className="dpr-vel-wrap" onPointerDown={onVelDown} onPointerMove={onVelMove} onPointerUp={() => (drag.current = null)}>
          <div className="dpr-vel" ref={vel} style={{ width }}>
            {notes.map((n) => (
              <div key={n.id} className={`dpr-vel-bar ${sel.has(n.id) ? 'sel' : ''}`} style={{ left: n.t * ppb, height: `${n.v * 100}%`, background: track.color }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
