import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { Song, SongNote } from '../../db/types'
import { uid } from '../../db/db'
import { beatsPerMeasure, isBlack, noteName, songLength } from './music'

const ROW = 14 // px par demi-ton

interface Props {
  song: Song
  beatW: number
  snap: number
  sel: string[]
  setSel: (ids: string[]) => void
  cursor: number
  setCursor: (b: number) => void
  playhead: number | null
  playing: Set<string>
  /** modification « en direct » pendant un geste */
  live: (notes: SongNote[]) => void
  /** modification validée (historique) */
  commit: (notes: SongNote[], before?: SongNote[]) => void
  newNote: (pitch: number, start: number) => SongNote
  onMeasureClick: (m: number) => void
  selectedMeasure: number | null
  loopRange: [number, number] | null
}

type Drag =
  | { kind: 'move'; startX: number; startY: number; orig: SongNote[]; moved: boolean; clickedId: string }
  | { kind: 'resize'; startX: number; orig: SongNote[] }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; add: boolean }

export function PianoRoll(p: Props) {
  const { song, beatW, snap } = p
  const total = songLength(song)
  const bpmM = beatsPerMeasure(song.timeSig)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [, force] = useState(0)

  // tessiture affichée : autour des notes, au moins do2–do6
  const [lo, hi] = useMemo(() => {
    const pitches = song.notes.map((n) => n.pitch)
    const l = Math.min(36, ...pitches.map((x) => x - 5))
    const h = Math.max(84, ...pitches.map((x) => x + 5))
    return [Math.max(21, l - (l % 12)), Math.min(108, h + (11 - (h % 12)))]
  }, [song.notes])
  const rows = hi - lo + 1
  const width = total * beatW
  const height = rows * ROW

  const yOf = (pitch: number) => (hi - pitch) * ROW
  const pitchAt = (y: number) => Math.max(lo, Math.min(hi, hi - Math.floor(y / ROW)))
  const beatAt = (x: number) => Math.max(0, Math.min(total - snap, Math.floor(x / beatW / snap) * snap))

  // centre la vue sur les notes au premier affichage
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const center = song.notes.length ? song.notes.reduce((s, n) => s + n.pitch, 0) / song.notes.length : 64
    el.scrollTop = Math.max(0, yOf(Math.round(center)) - el.clientHeight / 2)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // suit la tête de lecture
  useEffect(() => {
    const el = scroller.current
    if (!el || p.playhead == null) return
    const x = p.playhead * beatW + 52
    if (x > el.scrollLeft + el.clientWidth - 80 || x < el.scrollLeft + 52) el.scrollLeft = x - 120
  }, [p.playhead, beatW])

  const local = (e: { clientX: number; clientY: number }) => {
    const r = (scroller.current!.querySelector('.pr-grid') as HTMLElement).getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onGridDown = (e: RPointerEvent) => {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const { x, y } = local(e)
    drag.current = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y, add: e.shiftKey }
  }
  const onNoteDown = (e: RPointerEvent, n: SongNote, edge: boolean) => {
    e.stopPropagation()
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    let ids = p.sel
    if (e.shiftKey) ids = p.sel.includes(n.id) ? p.sel.filter((i) => i !== n.id) : [...p.sel, n.id]
    else if (!p.sel.includes(n.id)) ids = [n.id]
    p.setSel(ids)
    const orig = song.notes.filter((x) => ids.includes(x.id))
    drag.current = edge ? { kind: 'resize', startX: e.clientX, orig } : { kind: 'move', startX: e.clientX, startY: e.clientY, orig, moved: false, clickedId: n.id }
  }

  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'marquee') {
      const { x, y } = local(e)
      d.x1 = x
      d.y1 = y
      force((k) => k + 1)
      return
    }
    if (d.kind === 'move') {
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.moved && Math.hypot(dx, dy) < 4) return
      d.moved = true
      const db = Math.round(dx / beatW / snap) * snap
      const dp = -Math.round(dy / ROW)
      p.live(
        song.notes.map((n) => {
          const o = d.orig.find((x) => x.id === n.id)
          return o ? { ...n, start: Math.max(0, Math.min(total - o.dur, o.start + db)), pitch: Math.max(lo, Math.min(hi, o.pitch + dp)) } : n
        }),
      )
    }
    if (d.kind === 'resize') {
      const db = Math.round((e.clientX - d.startX) / beatW / snap) * snap
      p.live(
        song.notes.map((n) => {
          const o = d.orig.find((x) => x.id === n.id)
          return o ? { ...n, dur: Math.max(snap, Math.min(total - o.start, o.dur + db)) } : n
        }),
      )
    }
  }

  const onUp = (e: RPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'marquee') {
      const moved = Math.abs(d.x1 - d.x0) > 4 || Math.abs(d.y1 - d.y0) > 4
      if (!moved) {
        // clic simple sur la grille : ajoute une note
        const pitch = pitchAt(d.y0)
        const start = beatAt(d.x0)
        const n = p.newNote(pitch, start)
        p.commit([...song.notes, n])
        p.setSel([n.id])
        p.setCursor(start + n.dur)
      } else {
        const x0 = Math.min(d.x0, d.x1) / beatW
        const x1 = Math.max(d.x0, d.x1) / beatW
        const pTop = pitchAt(Math.min(d.y0, d.y1))
        const pBot = pitchAt(Math.max(d.y0, d.y1))
        const hit = song.notes.filter((n) => n.start < x1 && n.start + n.dur > x0 && n.pitch <= pTop && n.pitch >= pBot).map((n) => n.id)
        p.setSel(d.add ? [...new Set([...p.sel, ...hit])] : hit)
      }
      force((k) => k + 1)
      return
    }
    if (d.kind === 'move' && !d.moved) {
      if (!e.shiftKey) p.setSel([d.clickedId])
      return
    }
    // valide le geste dans l'historique
    p.commit(song.notes, song.notes.map((n) => d.orig.find((o) => o.id === n.id) ?? n))
  }

  const marq = drag.current?.kind === 'marquee' && (Math.abs(drag.current.x1 - drag.current.x0) > 4 || Math.abs(drag.current.y1 - drag.current.y0) > 4) ? drag.current : null

  return (
    <div className="pr" ref={scroller}>
      <div className="pr-inner" style={{ width: width + 52, height: height + 28 }}>
        {/* règle des mesures */}
        <div className="pr-ruler" style={{ width }}>
          {Array.from({ length: song.measures }, (_, m) => {
            const section = song.sections.find((s) => s.measure === m)
            return (
              <button
                key={m}
                className={`pr-measure ${p.selectedMeasure === m ? 'sel' : ''} ${p.loopRange && m >= p.loopRange[0] && m <= p.loopRange[1] ? 'loop' : ''}`}
                style={{ left: m * bpmM * beatW, width: bpmM * beatW }}
                onClick={() => p.onMeasureClick(m)}
                title="Cliquer pour choisir cette mesure"
              >
                <span className="pr-mnum">{m + 1}</span>
                {section && <span className="pr-section">{section.name}</span>}
              </button>
            )
          })}
        </div>
        {/* étiquettes des touches */}
        <div className="pr-keys" style={{ height }}>
          {Array.from({ length: rows }, (_, i) => {
            const pitch = hi - i
            return (
              <div key={pitch} className={`pr-key ${isBlack(pitch) ? 'black' : ''}`} style={{ top: i * ROW, height: ROW }}>
                {pitch % 12 === 0 && <span>{noteName(pitch, song.noteNames)}</span>}
              </div>
            )
          })}
        </div>
        {/* grille */}
        <div className="pr-grid" style={{ width, height }} onPointerDown={onGridDown} onPointerMove={onMove} onPointerUp={onUp}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className={`pr-row ${isBlack(hi - i) ? 'black' : ''} ${(hi - i) % 12 === 0 ? 'c' : ''}`} style={{ top: i * ROW, height: ROW }} />
          ))}
          {Array.from({ length: Math.ceil(total) }, (_, b) => (
            <div key={b} className={`pr-beat ${b % bpmM === 0 ? 'bar' : ''}`} style={{ left: b * beatW }} />
          ))}
          {p.loopRange && <div className="pr-loop" style={{ left: p.loopRange[0] * bpmM * beatW, width: (p.loopRange[1] - p.loopRange[0] + 1) * bpmM * beatW }} />}
          {song.notes.map((n) => (
            <div
              key={n.id}
              className={`pr-note hand-${n.hand} ${p.sel.includes(n.id) ? 'sel' : ''} ${p.playing.has(n.id) ? 'playing' : ''}`}
              style={{ left: n.start * beatW + 1, top: yOf(n.pitch) + 1, width: Math.max(6, n.dur * beatW - 2), height: ROW - 2 }}
              onPointerDown={(e) => onNoteDown(e, n, false)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              title={`${noteName(n.pitch, song.noteNames)}${n.finger ? ` · doigt ${n.finger}` : ''}`}
            >
              {n.dur * beatW > 34 && <span className="pr-note-name">{noteName(n.pitch, song.noteNames, false)}</span>}
              {n.finger ? <span className="pr-finger">{n.finger}</span> : null}
              <span className="pr-resize" onPointerDown={(e) => onNoteDown(e, n, true)} />
            </div>
          ))}
          <div className="pr-cursor" style={{ left: p.cursor * beatW }} />
          {p.playhead != null && <div className="pr-playhead" style={{ left: p.playhead * beatW }} />}
          {marq && (
            <div className="pr-marquee" style={{ left: Math.min(marq.x0, marq.x1), top: Math.min(marq.y0, marq.y1), width: Math.abs(marq.x1 - marq.x0), height: Math.abs(marq.y1 - marq.y0) }} />
          )}
        </div>
      </div>
    </div>
  )
}

export function makeNote(pitch: number, start: number, dur: number, hand: 'R' | 'L', finger?: number | null): SongNote {
  return { id: uid(), pitch, start, dur, hand, finger: finger ?? null }
}
