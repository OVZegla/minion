import { memo, useEffect, useRef, useState } from 'react'
import { soundEmoji, soundName } from './bank'
import { Meter, usePlayhead } from './controls'
import { loadAudio, type Engine } from './engine'
import { beatsPerBar, clipBeats, clipEnd, projectEnd, TRACK_COLORS, type Clip, type DawProject, type Track, type TrackKind } from './types'
import { peaksOf } from './wav'

const HEAD_WIDE = 236
const HEAD_NARROW = 150
/** Largeur des en-têtes de piste (plus étroits sur petit écran, voir daw.css). */
function useHead() {
  const get = () => (window.innerWidth <= 900 ? HEAD_NARROW : HEAD_WIDE)
  const [h, setH] = useState(get)
  useEffect(() => {
    const on = () => setH(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return h
}
export const ROW_H = 86

export type Update = (fn: (p: DawProject) => DawProject, merge?: string) => void

interface Props {
  project: DawProject
  engine: Engine
  ppb: number
  setPpb: (f: (p: number) => number) => void
  snap: number
  selTrack: string | null
  selClips: Set<string>
  setSelTrack: (id: string | null) => void
  setSelClips: (s: Set<string>) => void
  update: Update
  onEditClip: (clipId: string) => void
  onAddTrack: (kind: TrackKind) => void
  onImport: (files: File[], trackId: string | null, beat: number) => void
  onDropLoop: (loopId: string, trackId: string | null, beat: number) => void
  onDropSound: (soundId: string, trackId: string | null) => void
  onPickSound: (trackId: string) => void
  playing: boolean
}

const midiKind = (k: TrackKind) => k !== 'audio'
const uid = () => crypto.randomUUID()

/* ---------------- Forme d'onde ---------------- */

export const Wave = memo(function Wave({ audioId, offset, duration, width, height, color }: { audioId: string; offset: number; duration: number; width: number; height: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [buf, setBuf] = useState<AudioBuffer | null>(null)
  useEffect(() => {
    let alive = true
    loadAudio(audioId).then((b) => alive && setBuf(b))
    return () => {
      alive = false
    }
  }, [audioId])
  const w = Math.max(1, Math.min(4096, Math.round(width)))
  useEffect(() => {
    const c = ref.current
    if (!c || !buf) return
    const peaks = peaksOf(audioId, buf)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = w * dpr
    c.height = height * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.clearRect(0, 0, w, height)
    g.fillStyle = color
    const mid = height / 2
    const per = (duration * peaks.rate) / w
    for (let x = 0; x < w; x++) {
      const i0 = Math.floor((offset + (x / w) * duration) * peaks.rate)
      let m = 0
      for (let i = i0; i < i0 + Math.max(1, per); i++) m = Math.max(m, peaks.data[i] ?? 0)
      const h = Math.max(0.5, Math.min(1, m * 1.15) * mid)
      g.fillRect(x, mid - h, 1, h * 2)
    }
  }, [buf, audioId, offset, duration, w, height, color])
  return <canvas ref={ref} className="wave" style={{ width: '100%', height }} />
})

/* ---------------- Aperçu des notes ---------------- */

const MiniNotes = memo(function MiniNotes({ clip, drums }: { clip: Clip; drums: boolean }) {
  const notes = clip.notes ?? []
  if (!notes.length) return null
  const len = clip.length ?? 4
  const ps = notes.map((n) => n.p)
  let lo = Math.min(...ps)
  let hi = Math.max(...ps)
  if (hi - lo < 12 && !drums) {
    const c = (hi + lo) / 2
    lo = c - 6
    hi = c + 6
  }
  const rows = hi - lo + 1
  return (
    <svg className="mini-notes" viewBox={`0 0 ${len * 16} ${rows * 10}`} preserveAspectRatio="none">
      {notes.map((n) =>
        n.t < len && n.t >= 0 ? <rect key={n.id} x={n.t * 16} y={(hi - n.p) * 10 + 1} width={Math.max(drums ? 2.5 : 1.5, Math.min(n.d, len - n.t) * 16 - 0.6)} height={8} rx={1.5} opacity={0.45 + n.v * 0.55} /> : null,
      )}
    </svg>
  )
})

/* ---------------- En-tête de piste ---------------- */

function TrackHead({ t, index, count, selected, project, update, onSelect, onPickSound }: { t: Track; index: number; count: number; selected: boolean; project: DawProject; update: Update; onSelect: () => void; onPickSound: () => void }) {
  const [menu, setMenu] = useState(false)
  const setT = (patch: Partial<Track>, merge?: string) => update((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) }), merge)
  const move = (d: number) =>
    update((p) => {
      const arr = [...p.tracks]
      const j = index + d
      if (j < 0 || j >= arr.length) return p
      ;[arr[index], arr[j]] = [arr[j], arr[index]]
      return { ...p, tracks: arr }
    })
  const icon = t.kind === 'audio' ? '🎙️' : soundEmoji(t.instrument)
  return (
    <div className={`th ${selected ? 'sel' : ''}`} style={{ ['--c' as string]: t.color }} onPointerDown={onSelect}>
      <div className="th-color" />
      <div className="th-main">
        <div className="th-top">
          <span className="th-icon">{icon}</span>
          <input className="th-name" value={t.name} onChange={(e) => setT({ name: e.target.value }, `name-${t.id}`)} onKeyDown={(e) => e.stopPropagation()} />
          <button className="th-more" onClick={() => setMenu((m) => !m)} aria-label="Options de la piste">
            ⋯
          </button>
        </div>
        <button className="th-sound" onClick={onPickSound} title={t.kind === 'audio' ? 'Piste audio : micro ou fichier' : 'Changer de son'}>
          {t.kind === 'audio' ? (t.arm ? 'Micro prêt à enregistrer' : 'Audio') : soundName(t.instrument)}
        </button>
        <div className="th-ctrls">
          <button className={`th-b m ${t.mute ? 'on' : ''}`} onClick={() => setT({ mute: !t.mute })} title="Muet">
            M
          </button>
          <button className={`th-b s ${t.solo ? 'on' : ''}`} onClick={() => setT({ solo: !t.solo })} title="Solo">
            S
          </button>
          <button className={`th-b r ${t.arm ? 'on' : ''}`} onClick={() => setT({ arm: !t.arm })} title={t.kind === 'audio' ? 'Armer : enregistrer le micro sur cette piste' : 'Armer : enregistrer ce que tu joues au clavier'}>
            ●
          </button>
          {t.kind === 'audio' && (
            <button className={`th-b mon ${t.monitor ? 'on' : ''}`} onClick={() => setT({ monitor: !t.monitor })} title="S’entendre en direct (avec un casque, sinon ça siffle)">
              🎧
            </button>
          )}
          <input className="th-vol" type="range" min={-48} max={6} step={0.5} value={t.volume} onChange={(e) => setT({ volume: +e.target.value }, `vol-${t.id}`)} onDoubleClick={() => setT({ volume: 0 })} title={`Volume ${t.volume} dB`} />
        </div>
        <Meter id={t.id} style={{ marginTop: 4 }} />
        {t.kind === 'audio' && t.arm && <Meter id="input" style={{ marginTop: 2, opacity: 0.85 }} />}
      </div>
      {menu && (
        <div className="dw-menu th-menu" onPointerDown={(e) => e.stopPropagation()} onMouseLeave={() => setMenu(false)}>
          <div className="dw-menu-colors">
            {TRACK_COLORS.map((c) => (
              <button key={c} style={{ background: c }} onClick={() => setT({ color: c })} aria-label="Couleur" />
            ))}
          </div>
          <button
            onClick={() => {
              setMenu(false)
              update((p) => {
                const copy: Track = { ...t, id: uid(), name: `${t.name} (copie)`, arm: false, clips: t.clips.map((c) => ({ ...c, id: uid(), notes: c.notes?.map((n) => ({ ...n, id: uid() })) })), fx: t.fx.map((f) => ({ ...f, id: uid() })) }
                const arr = [...p.tracks]
                arr.splice(index + 1, 0, copy)
                return { ...p, tracks: arr }
              })
            }}
          >
            Dupliquer la piste
          </button>
          {index > 0 && <button onClick={() => move(-1)}>Monter</button>}
          {index < count - 1 && <button onClick={() => move(1)}>Descendre</button>}
          <button
            className="danger"
            onClick={() => {
              setMenu(false)
              update((p) => ({ ...p, tracks: p.tracks.filter((x) => x.id !== t.id) }))
            }}
          >
            Supprimer la piste
          </button>
        </div>
      )}
      {project.tracks.length === 0 && null}
    </div>
  )
}

/* ---------------- Vue d'arrangement ---------------- */

type ClipDrag = {
  mode: 'move' | 'left' | 'right'
  x: number
  y: number
  orig: DawProject
  clipId: string
  ids: Set<string>
  moved: boolean
}

export function Arrange(props: Props) {
  const { project: p, engine, ppb, snap, selTrack, selClips, setSelTrack, setSelClips, update, onEditClip, playing } = props
  const bpb = beatsPerBar(p.timeSig)
  const spb = 60 / p.bpm
  const scroll = useRef<HTMLDivElement>(null)
  const playhead = useRef<HTMLDivElement>(null)
  const drag = useRef<ClipDrag | null>(null)
  const HEAD = useHead()
  const loopDrag = useRef<{ mode: 'new' | 'move' | 'l' | 'r'; x0: number; orig: { start: number; end: number } } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; trackId: string; clipId: string } | null>(null)
  const [dropHint, setDropHint] = useState<string | null>(null)

  usePlayhead(playhead, ppb, HEAD)

  const totalBeats = Math.max(projectEnd(p) + bpb * 16, bpb * 48, (p.loop.end + bpb * 8))
  const width = totalBeats * ppb
  const q = (b: number) => (snap ? Math.round(b / snap) * snap : b)

  // suivre la lecture
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      const s = scroll.current
      if (s) {
        const x = engine.position() * ppb
        const view = s.clientWidth - HEAD
        if (x > s.scrollLeft + view - 40 || x < s.scrollLeft) s.scrollLeft = Math.max(0, x - 60)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, engine, ppb])

  const beatAt = (clientX: number) => {
    const r = scroll.current!.getBoundingClientRect()
    return (clientX - r.left + scroll.current!.scrollLeft - HEAD) / ppb
  }

  /* --- règle et boucle --- */
  const onRulerDown = (e: React.PointerEvent, loopZone: boolean) => {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const b = beatAt(e.clientX)
    if (!loopZone) {
      engine.seek(Math.max(0, q(b)))
      loopDrag.current = null
      return
    }
    const L = p.loop
    const edge = 6 / ppb
    const mode: 'new' | 'move' | 'l' | 'r' = Math.abs(b - L.start) < edge ? 'l' : Math.abs(b - L.end) < edge ? 'r' : b > L.start && b < L.end ? 'move' : 'new'
    loopDrag.current = { mode, x0: b, orig: { start: L.start, end: L.end } }
    if (mode === 'new') {
      const s = Math.max(0, Math.floor(b / bpb) * bpb)
      update((pp) => ({ ...pp, loop: { on: true, start: s, end: s + bpb } }), 'loop')
    }
  }
  const onRulerMove = (e: React.PointerEvent) => {
    const d = loopDrag.current
    if (!d) {
      if (e.buttons === 1) engine.seek(Math.max(0, q(beatAt(e.clientX))))
      return
    }
    const b = beatAt(e.clientX)
    const qb = (x: number) => Math.max(0, snap ? Math.round(x / Math.max(snap, 1)) * Math.max(snap, 1) : x)
    const o = d.orig
    let start = o.start
    let end = o.end
    if (d.mode === 'new') {
      const a = Math.floor(Math.min(d.x0, b) / bpb) * bpb
      const z = Math.ceil(Math.max(d.x0, b) / bpb) * bpb
      start = Math.max(0, a)
      end = Math.max(start + bpb, z)
    } else if (d.mode === 'move') {
      const dl = qb(o.start + (b - d.x0)) - o.start
      start = Math.max(0, o.start + dl)
      end = start + (o.end - o.start)
    } else if (d.mode === 'l') start = Math.min(o.end - 1, qb(b))
    else end = Math.max(o.start + 1, qb(b))
    update((pp) => ({ ...pp, loop: { ...pp.loop, on: true, start, end } }), 'loop')
  }

  /* --- clips --- */
  const onClipDown = (e: React.PointerEvent, t: Track, c: Clip) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelTrack(t.id)
    let ids = selClips
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      ids = new Set(selClips)
      if (ids.has(c.id)) ids.delete(c.id)
      else ids.add(c.id)
    } else if (!selClips.has(c.id)) ids = new Set([c.id])
    let orig = p
    let clipId = c.id
    if (e.altKey) {
      // Alt + glisser : copie
      const map = new Map<string, string>()
      orig = {
        ...p,
        tracks: p.tracks.map((tr) => ({
          ...tr,
          clips: [
            ...tr.clips,
            ...tr.clips
              .filter((x) => ids.has(x.id))
              .map((x) => {
                const id = uid()
                map.set(x.id, id)
                return { ...x, id, notes: x.notes?.map((n) => ({ ...n, id: uid() })) }
              }),
          ],
        })),
      }
      ids = new Set(map.values())
      clipId = map.get(c.id)!
      update(() => orig, 'clip-dup')
    }
    setSelClips(ids)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mode = e.clientX < r.left + 7 ? 'left' : e.clientX > r.right - 7 ? 'right' : 'move'
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, y: e.clientY, orig, clipId, ids, moved: false }
  }

  const onClipMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dxPx = e.clientX - d.x
    const dyPx = e.clientY - d.y
    if (!d.moved && Math.abs(dxPx) < 3 && Math.abs(dyPx) < 3) return
    d.moved = true
    const o = d.orig
    let primary: Clip | undefined
    for (const t of o.tracks) primary = primary ?? t.clips.find((x) => x.id === d.clipId)
    if (!primary) return
    const dx = dxPx / ppb
    if (d.mode === 'move') {
      const delta = q(primary.start + dx) - primary.start
      const dRow = Math.round(dyPx / ROW_H)
      const moved: { from: number; to: number; clip: Clip }[] = []
      o.tracks.forEach((t, i) =>
        t.clips.forEach((c) => {
          if (!d.ids.has(c.id)) return
          let to = Math.max(0, Math.min(o.tracks.length - 1, i + dRow))
          // un clip audio ne va que sur une piste audio, un clip de notes sur une piste d'instrument
          if (midiKind(o.tracks[to].kind) !== midiKind(t.kind)) to = i
          moved.push({ from: i, to, clip: { ...c, start: Math.max(0, c.start + delta) } })
        }),
      )
      update(
        () => ({
          ...o,
          tracks: o.tracks.map((t, i) => ({ ...t, clips: [...t.clips.filter((c) => !d.ids.has(c.id)), ...moved.filter((m) => m.to === i).map((m) => m.clip)] })),
        }),
        'clip-drag',
      )
      return
    }
    // redimensionnement (sur le clip saisi seulement)
    const c = primary
    let next: Clip = c
    if (d.mode === 'right') {
      const end = Math.max(c.start + (snap || 0.25), q(clipEnd(c, p.bpm) + dx))
      if (c.audioId) {
        const total = engine.graph.audio.get(c.audioId)?.duration ?? (c.offset ?? 0) + (c.duration ?? 0)
        next = { ...c, duration: Math.max(0.05, Math.min(total - (c.offset ?? 0), (end - c.start) * spb)) }
      } else {
        // allonger un clip de notes répète son motif (comme une boucle)
        const L0 = c.length ?? 4
        const len = end - c.start
        const base = (c.notes ?? []).filter((n) => n.t < L0 && n.t >= 0)
        let notes = c.notes ?? []
        if (len > L0 && base.length) {
          notes = []
          for (let k = 0; k * L0 < len; k++) for (const n of base) if (n.t + k * L0 < len) notes.push(k === 0 ? n : { ...n, id: uid(), t: n.t + k * L0 })
        }
        next = { ...c, length: len, notes }
      }
    } else {
      const end = clipEnd(c, p.bpm)
      let start = Math.min(end - (snap || 0.25), Math.max(0, q(c.start + dx)))
      if (c.audioId) {
        const minStart = c.start - (c.offset ?? 0) / spb
        start = Math.max(minStart, start)
        const shift = (start - c.start) * spb
        next = { ...c, start, offset: (c.offset ?? 0) + shift, duration: (c.duration ?? 0) - shift }
      } else {
        const shift = start - c.start
        next = { ...c, start, length: (c.length ?? 4) - shift, notes: c.notes?.map((n) => ({ ...n, t: n.t - shift })) }
      }
    }
    update(() => ({ ...o, tracks: o.tracks.map((t) => ({ ...t, clips: t.clips.map((x) => (x.id === c.id ? next : x)) })) }), 'clip-drag')
  }

  const onClipUp = () => {
    drag.current = null
  }

  /* --- pistes --- */
  const onLaneDown = (e: React.PointerEvent, t: Track) => {
    if (e.button !== 0) return
    setSelTrack(t.id)
    setSelClips(new Set())
    if (!playing) engine.seek(Math.max(0, q(beatAt(e.clientX))))
  }
  const onLaneDouble = (e: React.MouseEvent, t: Track) => {
    if (t.kind === 'audio') return
    const b = Math.max(0, Math.floor(beatAt(e.clientX) / bpb) * bpb)
    const c: Clip = { id: uid(), start: b, name: t.kind === 'drums' ? 'Rythme' : 'Notes', length: t.kind === 'drums' ? bpb : bpb * 2, notes: [] }
    update((pp) => ({ ...pp, tracks: pp.tracks.map((x) => (x.id === t.id ? { ...x, clips: [...x.clips, c] } : x)) }))
    setSelClips(new Set([c.id]))
    onEditClip(c.id)
  }

  const onDrop = (e: React.DragEvent, trackId: string | null) => {
    e.preventDefault()
    setDropHint(null)
    const b = Math.max(0, snap ? Math.floor(beatAt(e.clientX) / bpb) * bpb : beatAt(e.clientX))
    const loopId = e.dataTransfer.getData('text/minion-loop')
    const soundId = e.dataTransfer.getData('text/minion-sound')
    if (loopId) props.onDropLoop(loopId, trackId, b)
    else if (soundId) props.onDropSound(soundId, trackId)
    else if (e.dataTransfer.files.length) props.onImport(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|flac|aac|webm)$/i.test(f.name)), trackId, b)
  }

  const clipAction = (action: string) => {
    const m = ctxMenu
    setCtxMenu(null)
    if (!m) return
    const pos = engine.position()
    update((pp) => ({
      ...pp,
      tracks: pp.tracks.map((t) => {
        if (t.id !== m.trackId) return t
        const c = t.clips.find((x) => x.id === m.clipId)
        if (!c) return t
        switch (action) {
          case 'dup': {
            const len = clipBeats(c, pp.bpm)
            return { ...t, clips: [...t.clips, { ...c, id: uid(), start: c.start + len, notes: c.notes?.map((n) => ({ ...n, id: uid() })) }] }
          }
          case 'mute':
            return { ...t, clips: t.clips.map((x) => (x.id === c.id ? { ...x, muted: !x.muted } : x)) }
          case 'del':
            return { ...t, clips: t.clips.filter((x) => x.id !== c.id) }
          case 'split': {
            const parts = splitClip(c, pos, pp.bpm)
            return parts ? { ...t, clips: [...t.clips.filter((x) => x.id !== c.id), ...parts] } : t
          }
          default:
            return t
        }
      }),
    }))
    if (action === 'edit') onEditClip(m.clipId)
  }

  // étiquettes de mesures espacées selon le zoom
  const barPx = bpb * ppb
  const every = barPx > 60 ? 1 : barPx > 30 ? 2 : barPx > 14 ? 4 : 8
  const bars = Math.ceil(totalBeats / bpb)

  return (
    <div className="arr" onPointerDown={() => ctxMenu && setCtxMenu(null)}>
      <div
        className="arr-scroll"
        ref={scroll}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const s = scroll.current!
            const b = beatAt(e.clientX)
            const f = e.deltaY < 0 ? 1.15 : 1 / 1.15
            props.setPpb((x) => {
              const nx = Math.max(3, Math.min(240, x * f))
              requestAnimationFrame(() => (s.scrollLeft = b * nx - (e.clientX - s.getBoundingClientRect().left - HEAD)))
              return nx
            })
          }
        }}
      >
        <div className="arr-inner" style={{ width: HEAD + width }}>
          <div className="arr-ruler-row">
            <div className="arr-corner">
              <span className="dw-faint">{p.tracks.length} piste{p.tracks.length > 1 ? 's' : ''}</span>
            </div>
            <div className="arr-ruler" style={{ width }}>
              <div className="arr-loopzone" onPointerDown={(e) => onRulerDown(e, true)} onPointerMove={onRulerMove} onPointerUp={() => (loopDrag.current = null)} title="Glisser pour définir la boucle">
                <div className={`arr-loop ${p.loop.on ? 'on' : ''}`} style={{ left: p.loop.start * ppb, width: (p.loop.end - p.loop.start) * ppb }} />
              </div>
              <div className="arr-bars" onPointerDown={(e) => onRulerDown(e, false)} onPointerMove={onRulerMove} onPointerUp={() => (loopDrag.current = null)}>
                {Array.from({ length: Math.ceil(bars / every) }, (_, i) => (
                  <span key={i} style={{ left: i * every * barPx }}>
                    {i * every + 1}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="arr-tracks" style={{ ['--bar' as string]: `${barPx}px`, ['--beat' as string]: `${ppb}px` }}>
            {p.loop.on && <div className="arr-loopband" style={{ left: HEAD + p.loop.start * ppb, width: (p.loop.end - p.loop.start) * ppb }} />}
            {p.tracks.map((t, i) => (
              <div key={t.id} className={`arr-row ${selTrack === t.id ? 'sel' : ''}`} data-kind={t.kind} style={{ height: ROW_H }}>
                <TrackHead t={t} index={i} count={p.tracks.length} selected={selTrack === t.id} project={p} update={update} onSelect={() => setSelTrack(t.id)} onPickSound={() => props.onPickSound(t.id)} />
                <div
                  className={`arr-lane ${dropHint === t.id ? 'drop' : ''}`}
                  style={{ width }}
                  onPointerDown={(e) => onLaneDown(e, t)}
                  onDoubleClick={(e) => onLaneDouble(e, t)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropHint(t.id)
                  }}
                  onDragLeave={() => setDropHint(null)}
                  onDrop={(e) => onDrop(e, t.id)}
                >
                  {t.clips.map((c) => {
                    const w = clipBeats(c, p.bpm) * ppb
                    return (
                      <div
                        key={c.id}
                        className={`clip ${c.audioId ? 'audio' : 'midi'} ${selClips.has(c.id) ? 'sel' : ''} ${c.muted ? 'muted' : ''}`}
                        style={{ left: c.start * ppb, width: Math.max(4, w), ['--c' as string]: t.color }}
                        onPointerDown={(e) => onClipDown(e, t, c)}
                        onPointerMove={onClipMove}
                        onPointerUp={onClipUp}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          onEditClip(c.id)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setSelClips(new Set([c.id]))
                          setCtxMenu({ x: e.clientX, y: e.clientY, trackId: t.id, clipId: c.id })
                        }}
                      >
                        <div className="clip-name">{c.name}</div>
                        <div className="clip-body">
                          {c.audioId ? <Wave audioId={c.audioId} offset={c.offset ?? 0} duration={c.duration ?? 0} width={w} height={ROW_H - 26} color="rgba(255,255,255,0.85)" /> : <MiniNotes clip={c} drums={t.kind === 'drums'} />}
                        </div>
                        {(c.fadeIn ?? 0) > 0.05 && <div className="clip-fade in" style={{ width: ((c.fadeIn ?? 0) / spb) * ppb }} />}
                        {(c.fadeOut ?? 0) > 0.05 && <div className="clip-fade out" style={{ width: ((c.fadeOut ?? 0) / spb) * ppb }} />}
                      </div>
                    )
                  })}
                  {t.clips.length === 0 && (
                    <div className="lane-hint">
                      {t.kind === 'audio'
                        ? t.arm
                          ? 'Appuie sur ● Enregistrer (ou R) pour chanter ici'
                          : 'Arme la piste (●) pour enregistrer, ou glisse un fichier audio'
                        : 'Double-clic pour écrire des notes · ou glisse une boucle depuis la banque'}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="arr-row add" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, null)}>
              <div className="th add">
                <button className="dw-btn" onClick={() => props.onAddTrack('audio')}>
                  🎙️ Voix
                </button>
                <button className="dw-btn" onClick={() => props.onAddTrack('instrument')}>
                  🎹 Instrument
                </button>
                <button className="dw-btn" onClick={() => props.onAddTrack('drums')}>
                  🥁 Batterie
                </button>
              </div>
              <div className="arr-lane empty" style={{ width }}>
                <span>Glisse ici une boucle, un son ou un fichier audio pour créer une piste</span>
              </div>
            </div>
            <div className="arr-playhead" ref={playhead} />
          </div>
        </div>
      </div>
      {ctxMenu && (
        <div className="dw-menu" style={{ left: ctxMenu.x, top: ctxMenu.y, position: 'fixed' }} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => clipAction('edit')}>Ouvrir dans l’éditeur</button>
          <button onClick={() => clipAction('split')}>Couper à la tête de lecture</button>
          <button onClick={() => clipAction('dup')}>Dupliquer à la suite</button>
          <button onClick={() => clipAction('mute')}>Rendre muet / audible</button>
          <button className="danger" onClick={() => clipAction('del')}>
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}

/** Coupe un clip en deux à la position donnée (en temps). */
export function splitClip(c: Clip, at: number, bpm: number): [Clip, Clip] | null {
  const end = clipEnd(c, bpm)
  if (at <= c.start + 0.01 || at >= end - 0.01) return null
  const spb = 60 / bpm
  if (c.audioId) {
    const first = (at - c.start) * spb
    return [
      { ...c, duration: first, fadeOut: 0.005 },
      { ...c, id: uid(), start: at, offset: (c.offset ?? 0) + first, duration: (c.duration ?? 0) - first, fadeIn: 0.005 },
    ]
  }
  const cut = at - c.start
  return [
    { ...c, length: cut, notes: (c.notes ?? []).filter((n) => n.t < cut).map((n) => ({ ...n, d: Math.min(n.d, cut - n.t) })) },
    { ...c, id: uid(), start: at, length: (c.length ?? 4) - cut, notes: (c.notes ?? []).filter((n) => n.t >= cut).map((n) => ({ ...n, id: uid(), t: n.t - cut })) },
  ]
}
