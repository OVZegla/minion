import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { pickFiles } from '../../db/assets'
import { Modal, SaveStatus, useAutosave, useUI } from '../../components/ui'
import { getKit, soundName } from './bank'
import { Arrange, splitClip, type Update } from './Arrange'
import { Browser } from './Browser'
import { Meter, meterLevel, PlayheadCtx } from './controls'
import { cacheAudio, Engine, renderProject } from './engine'
import { createInstrument } from './instruments'
import { KEYMAP, Keys } from './Keys'
import { AudioClipPanel, FxRack, Mixer } from './Panels'
import { LOOPS, loopClip, newTrack } from './patterns'
import { PianoRoll } from './PianoRoll'
import { Tour, type TourStep } from './Tour'
import { lessonSteps, type LessonApi } from './lesson'
import { decodeBlob } from './samples'
import { beatsPerBar, clipEnd, projectEnd, type Clip, type DawProject, type Track, type TrackKind } from './types'
import { bufferToWav, download } from './wav'
import './daw.css'

const uid = () => crypto.randomUUID()

export function DawPage() {
  const { id } = useParams()
  const rec = useLiveQuery(() => db.daw.get(id!).then((r) => r ?? null), [id])
  if (rec === undefined) return <div className="dw dw-empty-page">Ouverture du studio…</div>
  if (rec === null) return <div className="dw dw-empty-page">Ce morceau n’existe plus.</div>
  return <DawEditor key={rec.id} initial={rec} />
}

type Panel = 'editor' | 'mixer' | 'fx' | 'keys'

/** Retire ce qui se trouve entre s et e sur une piste (une nouvelle prise remplace l'ancienne). */
function carve(clips: Clip[], s: number, e: number, bpm: number, kindAudio: boolean): Clip[] {
  const out: Clip[] = []
  for (const c of clips) {
    if (!!c.audioId !== kindAudio) {
      out.push(c)
      continue
    }
    const cs = c.start
    const ce = clipEnd(c, bpm)
    if (ce <= s || cs >= e) out.push(c)
    else if (cs >= s && ce <= e) continue
    else {
      let rest: Clip | null = c
      if (cs < s) {
        const parts = splitClip(c, s, bpm)
        if (parts) {
          out.push(parts[0])
          rest = parts[1]
        }
      }
      if (rest && clipEnd(rest, bpm) > e) {
        const parts = splitClip(rest, e, bpm)
        if (parts) out.push(parts[1])
      }
    }
  }
  return out
}

function DawEditor({ initial }: { initial: DawProject }) {
  const navigate = useNavigate()
  const { toast } = useUI()
  const [proj, setProj] = useState(initial)
  const projRef = useRef(initial)
  const hist = useRef({ past: [] as DawProject[], future: [] as DawProject[], merge: '', at: 0 })
  const [engine, setEngine] = useState<Engine | null>(null)
  const [tstate, setTstate] = useState<'stopped' | 'playing' | 'recording'>('stopped')
  const [selTrack, setSelTrack] = useState<string | null>(initial.tracks[0]?.id ?? null)
  const [selClips, setSelClips] = useState<Set<string>>(new Set())
  const [editClip, setEditClip] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel | null>(() => (initial.tracks.some((t) => t.clips.length) ? 'mixer' : 'keys'))
  const [fxTarget, setFxTarget] = useState<string>(initial.tracks[0]?.id ?? 'master')
  const [browser, setBrowser] = useState(() => window.innerWidth > 1000)
  const [browserFor, setBrowserFor] = useState<string | null>(null)
  const [ppb, setPpb] = useState(26)
  const [snapSel, setSnapSel] = useState('0.25')
  const [panelH, setPanelH] = useState(() => {
    try {
      return Math.max(160, Math.min(700, +(localStorage.getItem('minion-daw-panel') ?? Math.max(300, Math.round(window.innerHeight * 0.42)))))
    } catch {
      return 300
    }
  })
  const [exporting, setExporting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [octave, setOctave] = useState(4)
  const [velocity, setVelocity] = useState(0.8)
  const [kbd, setKbd] = useState(false)
  const [held, setHeld] = useState<Set<number>>(new Set())
  const [midiName, setMidiName] = useState<string | null>(null)
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const timeRef = useRef<HTMLDivElement>(null)
  const clipboard = useRef<{ clips: Clip[]; kind: TrackKind } | null>(null)
  const [params, setParams] = useSearchParams()
  const [tour, setTour] = useState(() => params.has('visite'))
  const [lesson, setLesson] = useState(() => params.has('lecon'))
  const playsRef = useRef(0)

  const bpb = beatsPerBar(proj.timeSig)
  const snap = snapSel === 'bar' ? bpb : +snapSel

  /* ---------------- Historique ---------------- */

  const update: Update = useCallback((fn, merge) => {
    const prev = projRef.current
    const next = fn(prev)
    if (next === prev) return
    const h = hist.current
    const now = Date.now()
    if (!(merge && merge === h.merge && now - h.at < 1500)) {
      h.past.push(prev)
      if (h.past.length > 200) h.past.shift()
    }
    h.merge = merge ?? ''
    h.at = now
    h.future = []
    projRef.current = { ...next, updatedAt: now }
    setProj(projRef.current)
  }, [])

  const undo = useCallback(() => {
    const h = hist.current
    const prev = h.past.pop()
    if (!prev) return
    h.future.push(projRef.current)
    h.merge = ''
    projRef.current = prev
    setProj(prev)
  }, [])
  const redo = useCallback(() => {
    const h = hist.current
    const next = h.future.pop()
    if (!next) return
    h.past.push(projRef.current)
    h.merge = ''
    projRef.current = next
    setProj(next)
  }, [])

  const saveState = useAutosave(proj, (p) => db.daw.put(p), 700)

  /* ---------------- Moteur audio ---------------- */

  useEffect(() => {
    const e = new Engine(projRef.current)
    setEngine(e)
    void db.daw.update(initial.id, { openedAt: Date.now() })
    return () => e.dispose()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engine?.setProject(proj)
  }, [engine, proj])

  // précharge les sons en arrière-plan
  useEffect(() => {
    if (!engine) return
    const t = setTimeout(() => void engine.prepare(), 400)
    return () => clearTimeout(t)
  }, [engine, proj.tracks.length, proj.tracks.map((t) => t.instrument).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!engine) return
    const off = engine.subscribe(() => {
      if (engine.state !== 'stopped') playsRef.current++
      setTstate(engine.state)
      setLoading(engine.loading)
    })
    engine.onRecorded = async (results, audio) => {
      if (audio) await db.dawAudio.put({ id: audio.id, createdAt: Date.now(), name: `Prise du ${new Date().toLocaleString('fr-FR')}`, blob: audio.blob, duration: audio.duration })
      update((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          const mine = results.filter((r) => r.trackId === t.id)
          if (!mine.length) return t
          let clips = t.clips
          for (const r of mine) clips = [...carve(clips, r.clip.start, clipEnd(r.clip, p.bpm), p.bpm, !!r.clip.audioId), r.clip]
          return { ...t, clips }
        }),
      }))
      setSelClips(new Set(results.map((r) => r.clip.id)))
      setEditClip(results[0]?.clip.id ?? null)
      toast(results.some((r) => r.clip.audioId) ? 'Prise enregistrée 🎙️' : 'Notes enregistrées 🎹')
    }
    return () => {
      off()
    }
  }, [engine, update, toast])

  /* tête de lecture, chrono et vumètres : hors React */
  const subs = useRef(new Set<(b: number) => void>())
  const playheadApi = useMemo(() => ({ subscribe: (fn: (b: number) => void) => (subs.current.add(fn), () => void subs.current.delete(fn)) }), [])
  useEffect(() => {
    if (!engine) return
    let raf = 0
    let last = NaN
    const levels = new Map<string, number>()
    let idle = 0
    const frame = () => {
      const pos = engine.position()
      if (pos !== last) {
        last = pos
        for (const fn of subs.current) fn(pos)
        if (timeRef.current) timeRef.current.innerHTML = formatTime(pos, projRef.current)
      }
      const active = engine.state !== 'stopped' || engine.inputOn || performance.now() - engine.liveAt < 4000
      if (active || idle < 40) {
        idle = active ? 0 : idle + 1
        const lv = engine.levels()
        document.querySelectorAll<HTMLElement>('[data-meter]').forEach((el) => {
          const id = el.dataset.meter!
          const v = id === 'L' ? lv.l : id === 'R' ? lv.r : id === 'input' ? lv.input : lv.tracks.get(id) ?? 0
          const shown = Math.max(meterLevel(v), (levels.get(id) ?? 0) * 0.9)
          levels.set(id, shown)
          el.style.setProperty('--lvl', shown.toFixed(3))
          el.classList.toggle('clip', v > 0.98)
        })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  /* ---------------- Transport ---------------- */

  const playStop = useCallback(async () => {
    if (!engine) return
    if (engine.state !== 'stopped') await engine.stop()
    else await engine.play(engine.position())
  }, [engine])

  const record = useCallback(async () => {
    if (!engine) return
    if (engine.state === 'recording') return engine.stop()
    if (engine.state === 'playing') await engine.stop()
    let p = projRef.current
    if (!p.tracks.some((t) => t.arm)) {
      const sel = p.tracks.find((t) => t.id === selTrack)
      if (sel) update((pp) => ({ ...pp, tracks: pp.tracks.map((t) => (t.id === sel.id ? { ...t, arm: true } : t)) }))
      else {
        const t = newTrack('audio', p.tracks.length, { arm: true })
        update((pp) => ({ ...pp, tracks: [...pp.tracks, t] }))
        setSelTrack(t.id)
      }
      p = projRef.current
      engine.setProject(p)
    }
    try {
      await engine.record(engine.position())
      if (p.tracks.some((t) => t.arm && t.kind !== 'audio') && !kbd && !midiName) toast('Joue au clavier (onglet Clavier) ou sur un clavier MIDI pour enregistrer des notes.')
    } catch (err) {
      console.error(err)
      toast('Le micro n’est pas accessible : autorise-le dans le navigateur.')
      await engine.stop()
    }
  }, [engine, selTrack, update, toast, kbd, midiName])

  const goStart = useCallback(() => engine?.seek(0), [engine])

  /* ---------------- Pistes, sons et boucles ---------------- */

  const addTrack = (kind: TrackKind, partial: Partial<Track> = {}) => {
    const t = newTrack(kind, projRef.current.tracks.length, partial)
    update((p) => ({ ...p, tracks: [...p.tracks, t] }))
    setSelTrack(t.id)
    if (kind !== 'audio') {
      void createInstrument(t.instrument).warm()
      setBrowserFor(t.id)
      setBrowser(true)
    }
    return t
  }

  const assignSound = (soundId: string, trackId?: string | null) => {
    const isKit = !!getKit(soundId)
    const p = projRef.current
    const target = p.tracks.find((t) => t.id === (trackId ?? browserFor ?? selTrack))
    const ok = target && ((isKit && target.kind === 'drums') || (!isKit && target.kind === 'instrument'))
    if (ok && target) {
      const defaultName = ['Piano', 'Batterie', 'Instrument', soundName(target.instrument)].includes(target.name)
      update((pp) => ({ ...pp, tracks: pp.tracks.map((t) => (t.id === target.id ? { ...t, instrument: soundId, name: defaultName ? soundName(soundId) : t.name } : t)) }))
    } else addTrack(isKit ? 'drums' : 'instrument', { instrument: soundId, name: soundName(soundId) })
    engine?.preview(soundId)
  }

  const addLoop = (loopId: string, trackId: string | null, beat?: number) => {
    const l = LOOPS.find((x) => x.id === loopId)
    if (!l) return
    const p = projRef.current
    const at = beat ?? Math.max(0, Math.floor((engine?.position() ?? 0) / bpb) * bpb)
    const clip = loopClip(l, at, Math.max(1, Math.round(4 / l.bars)))
    const target = p.tracks.find((t) => t.id === trackId)
    if (target && target.kind === l.kind) {
      update((pp) => ({ ...pp, tracks: pp.tracks.map((t) => (t.id === target.id ? { ...t, clips: [...carve(t.clips, clip.start, clipEnd(clip, pp.bpm), pp.bpm, false), clip] } : t)) }))
      setSelTrack(target.id)
    } else {
      const t = newTrack(l.kind, p.tracks.length, { name: l.name, instrument: l.sound, clips: [clip] })
      update((pp) => ({ ...pp, tracks: [...pp.tracks, t] }))
      setSelTrack(t.id)
    }
    setSelClips(new Set([clip.id]))
  }

  const previewLoop = async (loopId: string) => {
    const l = LOOPS.find((x) => x.id === loopId)
    if (!engine || !l) return
    const inst = createInstrument(l.sound)
    const notes = l.notes()
    await engine.ctx.resume()
    await Promise.race([inst.prepare(notes.map((n) => n.p)), new Promise((r) => setTimeout(r, 4000))])
    const spb = 60 / projRef.current.bpm
    const t0 = engine.ctx.currentTime + 0.05
    for (const n of notes) inst.noteOn(engine.ctx, engine.graph.masterIn, n.p, n.v, t0 + n.t * spb)?.stop(t0 + (n.t + n.d) * spb)
  }

  const importFiles = async (files: File[], trackId: string | null, beat: number) => {
    if (!files.length) return
    setBusy('Import du son…')
    try {
      let target = projRef.current.tracks.find((t) => t.id === trackId && t.kind === 'audio')
      let at = beat
      for (const f of files) {
        let buf: AudioBuffer
        try {
          buf = await decodeBlob(f)
        } catch {
          toast(`« ${f.name} » n’est pas un son lisible.`)
          continue
        }
        const id = uid()
        await db.dawAudio.put({ id, createdAt: Date.now(), name: f.name, blob: f, duration: buf.duration })
        cacheAudio(id, buf)
        engine?.graph.audio.set(id, buf)
        const clip: Clip = { id: uid(), start: at, name: f.name.replace(/\.[^.]+$/, ''), audioId: id, offset: 0, duration: buf.duration, gain: 0 }
        if (!target) target = addTrack('audio', { name: clip.name })
        const tid = target.id
        update((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === tid ? { ...t, clips: [...t.clips, clip] } : t)) }))
        at += (buf.duration * projRef.current.bpm) / 60
      }
    } finally {
      setBusy(null)
    }
  }

  /* ---------------- Clips ---------------- */

  const allClips = useMemo(() => proj.tracks.flatMap((t) => t.clips.map((c) => ({ t, c }))), [proj])
  const editing = allClips.find((x) => x.c.id === editClip)

  const openEditor = (clipId: string) => {
    setEditClip(clipId)
    setPanel('editor')
    const tr = projRef.current.tracks.find((t) => t.clips.some((c) => c.id === clipId))
    if (tr) setSelTrack(tr.id)
  }

  const deleteSelected = () => {
    if (!selClips.size) return
    update((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !selClips.has(c.id)) })) }))
    setSelClips(new Set())
  }
  const duplicateSelected = () => {
    if (!selClips.size) return
    const p = projRef.current
    const sel = p.tracks.flatMap((t) => t.clips.filter((c) => selClips.has(c.id)))
    const start = Math.min(...sel.map((c) => c.start))
    const end = Math.max(...sel.map((c) => clipEnd(c, p.bpm)))
    const shift = Math.ceil((end - start) / bpb - 1e-6) * bpb
    const ids = new Set<string>()
    update((pp) => ({
      ...pp,
      tracks: pp.tracks.map((t) => ({
        ...t,
        clips: [
          ...t.clips,
          ...t.clips
            .filter((c) => selClips.has(c.id))
            .map((c) => {
              const id = uid()
              ids.add(id)
              return { ...c, id, start: c.start + shift, notes: c.notes?.map((n) => ({ ...n, id: uid() })) }
            }),
        ],
      })),
    }))
    setSelClips(ids)
  }
  const splitAtPlayhead = () => {
    const at = engine?.position() ?? 0
    update((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        const targets = t.clips.filter((c) => (selClips.size ? selClips.has(c.id) : t.id === selTrack) && c.start < at && clipEnd(c, p.bpm) > at)
        if (!targets.length) return t
        let clips = t.clips
        for (const c of targets) {
          const parts = splitClip(c, at, p.bpm)
          if (parts) clips = [...clips.filter((x) => x.id !== c.id), ...parts]
        }
        return { ...t, clips }
      }),
    }))
  }
  const copy = () => {
    const p = projRef.current
    const t = p.tracks.find((tr) => tr.clips.some((c) => selClips.has(c.id)))
    if (!t) return
    clipboard.current = { clips: t.clips.filter((c) => selClips.has(c.id)), kind: t.kind }
  }
  const paste = () => {
    const cb = clipboard.current
    if (!cb) return
    const p = projRef.current
    const target = p.tracks.find((t) => t.id === selTrack && (t.kind === 'audio') === (cb.kind === 'audio')) ?? p.tracks.find((t) => (t.kind === 'audio') === (cb.kind === 'audio'))
    if (!target) return
    const at = engine?.position() ?? 0
    const start = Math.min(...cb.clips.map((c) => c.start))
    const ids = new Set<string>()
    const copies = cb.clips.map((c) => {
      const id = uid()
      ids.add(id)
      return { ...c, id, start: at + (c.start - start), notes: c.notes?.map((n) => ({ ...n, id: uid() })) }
    })
    update((pp) => ({ ...pp, tracks: pp.tracks.map((t) => (t.id === target.id ? { ...t, clips: [...t.clips, ...copies] } : t)) }))
    setSelClips(ids)
  }

  /* ---------------- Jeu en direct ---------------- */

  const liveTrack = proj.tracks.find((t) => t.id === selTrack && t.kind !== 'audio') ?? null
  const liveRef = useRef<string | null>(null)
  liveRef.current = liveTrack?.id ?? null
  const noteDown = useCallback(
    (p: number, v?: number) => {
      const tid = liveRef.current
      if (!engine || !tid) return
      engine.noteOn(tid, p, v ?? velocity)
      setHeld((h) => new Set(h).add(p))
    },
    [engine, velocity],
  )
  const noteUp = useCallback(
    (p: number) => {
      const tid = liveRef.current
      if (!engine || !tid) return
      engine.noteOff(tid, p)
      setHeld((h) => {
        const n = new Set(h)
        n.delete(p)
        return n
      })
    },
    [engine],
  )
  useEffect(() => {
    if (liveTrack && engine) void engine.graph.strips.get(liveTrack.id)?.instrument?.warm()
  }, [liveTrack?.id, liveTrack?.instrument, engine]) // eslint-disable-line react-hooks/exhaustive-deps

  const connectMidi = async () => {
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
    if (!nav.requestMIDIAccess) return toast('Ce navigateur ne gère pas les claviers MIDI (essaie Chrome ou Edge).')
    try {
      const access = await nav.requestMIDIAccess()
      const bind = () => {
        let name: string | null = null
        access.inputs.forEach((inp) => {
          name = inp.name ?? 'Clavier MIDI'
          inp.onmidimessage = (m) => {
            const [st, d1, d2] = m.data ?? []
            const cmd = st & 0xf0
            if (cmd === 0x90 && d2 > 0) noteDownRef.current(d1, d2 / 127)
            else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteUpRef.current(d1)
          }
        })
        setMidiName(name ? `${name} connecté` : null)
        if (!name) toast('Aucun clavier MIDI détecté. Branche-le puis réessaie.')
      }
      access.onstatechange = bind
      bind()
    } catch {
      toast('Accès MIDI refusé.')
    }
  }
  const noteDownRef = useRef(noteDown)
  noteDownRef.current = noteDown
  const noteUpRef = useRef(noteUp)
  noteUpRef.current = noteUp

  /* ---------------- Raccourcis ---------------- */

  const kbHeldRef = useRef(new Set<string>())
  useEffect(() => {
    const kbHeld = kbHeldRef.current
    const onDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]') && !(el as HTMLInputElement).type?.match(/range|checkbox|button/)) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (kbd && !mod && !e.altKey) {
        if (KEYMAP[e.code] !== undefined) {
          e.preventDefault()
          if (e.repeat || kbHeld.has(e.code)) return
          kbHeld.add(e.code)
          noteDown((octave + 1) * 12 + KEYMAP[e.code])
          return
        }
        if (e.code === 'KeyZ') return setOctave((o) => Math.max(0, o - 1))
        if (e.code === 'KeyX') return setOctave((o) => Math.min(8, o + 1))
        if (e.code === 'KeyC') return setVelocity((v) => Math.max(0.1, v - 0.1))
        if (e.code === 'KeyV') return setVelocity((v) => Math.min(1, v + 0.1))
      }
      if (e.code === 'Space') {
        e.preventDefault()
        void playStop()
      } else if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if (mod && k === 'd') {
        e.preventDefault()
        duplicateSelected()
      } else if (mod && k === 'e') {
        e.preventDefault()
        splitAtPlayhead()
      } else if (mod && k === 'c') copy()
      else if (mod && k === 'v') paste()
      else if (mod && k === 'a') {
        e.preventDefault()
        setSelClips(new Set(projRef.current.tracks.flatMap((t) => t.clips.map((c) => c.id))))
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selClips.size) {
          e.preventDefault()
          deleteSelected()
        }
      } else if (e.key === 'Home' || e.key === 'Enter') goStart()
      else if (e.key === 'Escape') setSelClips(new Set())
      else if (!mod && !kbd) {
        if (k === 'r') void record()
        else if (k === 'l') update((p) => ({ ...p, loop: { ...p.loop, on: !p.loop.on } }))
        else if (k === 'k') update((p) => ({ ...p, metronome: !p.metronome }))
        else if (k === 'b') setBrowser((b) => !b)
        else if (k === '+' || k === '=') setPpb((x) => Math.min(240, x * 1.25))
        else if (k === '-') setPpb((x) => Math.max(3, x / 1.25))
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (kbHeld.has(e.code)) {
        kbHeld.delete(e.code)
        noteUp((octave + 1) * 12 + KEYMAP[e.code])
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  })

  /* ---------------- Micro ---------------- */

  useEffect(() => {
    if (!engine) return
    const armedAudio = proj.tracks.some((t) => t.kind === 'audio' && t.arm)
    if (armedAudio && !engine.inputOn) {
      engine
        .enableInput(engine.inputDeviceId)
        .then(() => navigator.mediaDevices.enumerateDevices())
        .then((d) => setInputs(d.filter((x) => x.kind === 'audioinput')))
        .catch(() => toast('Autorise le micro pour enregistrer ta voix.'))
    } else if (!armedAudio && engine.inputOn && engine.state === 'stopped') engine.disableInput()
  }, [engine, proj.tracks, toast])

  /* ---------------- Export ---------------- */

  const doExport = async (mode: 'mix' | 'loop' | 'stems') => {
    const p = projRef.current
    if (!projectEnd(p)) return toast('Le morceau est vide.')
    setBusy('Mixage en cours…')
    try {
      const safe = (p.title || 'morceau').replace(/[\\/:*?"<>|]+/g, '-')
      if (mode === 'stems') {
        for (const t of p.tracks) {
          if (!t.clips.length) continue
          const solo: DawProject = { ...p, masterFx: [], tracks: [{ ...t, mute: false, solo: false }] }
          const buf = await renderProject(solo, { to: projectEnd(p) })
          download(bufferToWav(buf), `${safe} - ${t.name}.wav`)
        }
      } else {
        const opts = mode === 'loop' ? { from: p.loop.start, to: p.loop.end, tail: 0 } : {}
        const buf = await renderProject(p, opts)
        download(bufferToWav(buf), `${safe}${mode === 'loop' ? ' (boucle)' : ''}.wav`)
      }
      toast('Export terminé ✨')
      setExporting(false)
    } catch (e) {
      console.error(e)
      toast('L’export a échoué.')
    } finally {
      setBusy(null)
    }
  }

  /* ---------------- Visite guidée ---------------- */

  const closeTour = () => {
    setTour(false)
    if (params.has('visite')) setParams({}, { replace: true })
  }
  const tourSteps: TourStep[] = [
    {
      title: 'Bienvenue dans ton studio !',
      before: () => {
        setPanel('mixer')
        setBrowser(false)
      },
      text: (
        <>
          <p>
            Ici tu peux <b>chanter</b>, <b>composer</b> et <b>mixer</b>, comme dans un vrai studio. J’ai préparé un petit morceau pour qu’on l’explore ensemble.
          </p>
          <p>Pendant la visite, tu peux cliquer partout pour essayer.</p>
        </>
      ),
    },
    {
      target: '.dw-transport',
      title: 'Lecture et enregistrement',
      text: (
        <>
          <p>
            <b>▶</b> lance le morceau (ou la <kbd>barre d’espace</kbd>), <b>●</b> enregistre (<kbd>R</kbd>), <b>🔁</b> fait tourner la boucle.
          </p>
          <p>À côté : où tu en es (mesure . temps) et le niveau du son. Essaie : appuie sur Espace !</p>
        </>
      ),
    },
    {
      target: '.dw-tempo',
      title: 'Tempo et métronome',
      text: (
        <p>
          Le <b>BPM</b> règle la vitesse de tout le morceau. La petite note allume le <b>métronome</b>, et le <b>décompte</b> te laisse une mesure pour te préparer avant d’enregistrer.
        </p>
      ),
    },
    {
      target: '.arr-ruler',
      title: 'La règle et la boucle',
      text: <p>Clique sur les numéros de mesure pour placer la tête de lecture. La bande orange au-dessus, c’est la <b>boucle</b> : tire-la pour choisir le passage qui se répète.</p>,
    },
    {
      target: '.arr-row .th',
      title: 'Les pistes',
      text: (
        <>
          <p>Chaque ligne est une piste, avec son instrument. Clique sur le nom de l’instrument pour en changer.</p>
          <p>
            <b>M</b> la rend muette, <b>S</b> l’écoute seule, <b>●</b> l’arme pour enregistrer, et la glissière règle son volume.
          </p>
        </>
      ),
    },
    {
      target: '.arr-row .clip',
      title: 'Les clips',
      text: (
        <p>
          Ces blocs colorés contiennent la musique. <b>Glisse-les</b> pour les déplacer, <b>tire leur bord droit</b> pour les allonger : un rythme se répète tout seul. <kbd>Alt</kbd> + glisser fait une copie, le clic droit ouvre un menu (couper, dupliquer…).
        </p>
      ),
    },
    {
      target: '.dpr',
      before: () => {
        const c = projRef.current.tracks.find((t) => t.kind === 'instrument' && t.clips.some((x) => x.notes))?.clips.find((x) => x.notes)
        if (c) openEditor(c.id)
      },
      title: 'L’éditeur de notes',
      text: (
        <p>
          Un <b>double-clic</b> sur un clip l’ouvre ici. Clique pour poser une note, tire son bord pour l’allonger ; la bande <b>Force</b> règle la douceur de chaque note. Pour la batterie, c’est une grille : un clic = un coup. Et un double-clic dans une piste vide crée un nouveau clip.
        </p>
      ),
    },
    {
      target: '.br',
      before: () => {
        setBrowserFor(null)
        setBrowser(true)
      },
      title: 'La banque de sons',
      text: (
        <p>
          Plus de <b>300 instruments</b> (pianos, guitares, cordes, synthés, batteries…) et <b>45 boucles</b> toutes prêtes. <b>▶</b> pour écouter, un clic pour donner ce son à la piste choisie, ou glisse-le sur une piste.
        </p>
      ),
    },
    {
      target: '.arr-row[data-kind="audio"] .th',
      title: 'Chanter',
      text: (
        <>
          <p>
            Pour t’enregistrer : arme la piste <b>Voix</b> avec <b>●</b> (le navigateur te demandera le micro), puis appuie sur Enregistrer. Une mesure de décompte… et c’est à toi !
          </p>
          <p>Le 🎧 te fait entendre ta voix en direct, avec un casque seulement (sinon ça siffle).</p>
        </>
      ),
    },
    {
      target: '.dw-tabs',
      before: () => setPanel('fx'),
      title: 'Mixeur, effets et clavier',
      text: (
        <p>
          En bas : l’<b>Éditeur</b>, le <b>Mixeur</b> (volume, gauche/droite, réverbe), les <b>Effets</b> (essaie les préréglages Voix pop, Radio, Robot…) et le <b>Clavier</b>, pour jouer avec les lettres de ton ordinateur ou un clavier MIDI.
        </p>
      ),
    },
    {
      target: '.dw-export-btn',
      before: () => setPanel('mixer'),
      title: 'Exporter',
      text: <p>Quand ton morceau est prêt, <b>Exporter</b> le transforme en fichier WAV à écouter partout. Tout s’enregistre tout seul, et <kbd>Ctrl Z</kbd> annule n’importe quelle erreur.</p>,
    },
    {
      title: 'À toi de jouer !',
      text: (
        <p>
          Voilà l’essentiel, le reste se découvre en s’amusant. Tu peux revoir cette visite avec le bouton <b>?</b> en haut. Joyeux anniversaire 🎂
        </p>
      ),
    },
  ]

  /* ---------------- Leçon pas à pas ---------------- */

  const lessonApi = useRef<LessonApi>(null!)
  lessonApi.current = {
    p: () => projRef.current,
    update,
    addTrack,
    addLoop,
    openEditor,
    setPanel,
    setBrowser,
    setBrowserFor,
    setSelTrack,
    setFxTarget,
    plays: () => playsRef.current,
  }
  const lessonList = useMemo(() => lessonSteps(new Proxy({} as LessonApi, { get: (_, k) => lessonApi.current[k as keyof LessonApi] })), [])
  const closeLesson = () => {
    setLesson(false)
    if (params.has('lecon')) setParams({}, { replace: true })
  }

  /* ---------------- Rendu ---------------- */

  if (!engine) return <div className="dw dw-empty-page">Ouverture du studio…</div>

  const setP = (patch: Partial<DawProject>, merge?: string) => update((p) => ({ ...p, ...patch }), merge)
  const resizePanel = (e: React.PointerEvent) => {
    const y0 = e.clientY
    const h0 = panelH
    const move = (ev: PointerEvent) => setPanelH(Math.max(140, Math.min(window.innerHeight - 220, h0 + (y0 - ev.clientY))))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPanelH((h) => {
        try {
          localStorage.setItem('minion-daw-panel', String(h))
        } catch {
          /* rien */
        }
        return h
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const armedAudio = proj.tracks.find((t) => t.kind === 'audio' && t.arm)

  return (
    <PlayheadCtx.Provider value={playheadApi}>
      {/* un bouton cliqué ne garde pas le focus : la barre d'espace reste à la lecture */}
      <div className="dw" onPointerUp={(e) => (e.target as HTMLElement).closest('button')?.blur()}>
        <header className="dw-top">
          <button className="dw-back" onClick={() => navigate('/musique')} title="Retour aux morceaux">
            ‹
          </button>
          <input className="dw-title" value={proj.title} onChange={(e) => setP({ title: e.target.value }, 'title')} onKeyDown={(e) => e.stopPropagation()} aria-label="Titre du morceau" />
          <div className="dw-group">
            <button className="dw-icon" onClick={undo} disabled={!hist.current.past.length} title="Annuler (Ctrl Z)">
              ↶
            </button>
            <button className="dw-icon" onClick={redo} disabled={!hist.current.future.length} title="Rétablir (Ctrl Y)">
              ↷
            </button>
          </div>

          <div className="dw-transport">
            <button className="dw-tbtn" onClick={goStart} title="Revenir au début (Entrée)">
              ⏮
            </button>
            <button className={`dw-tbtn play ${tstate === 'playing' ? 'on' : ''}`} onClick={playStop} title="Lecture / arrêt (Espace)">
              {tstate === 'stopped' ? '▶' : '■'}
            </button>
            <button className={`dw-tbtn rec ${tstate === 'recording' ? 'on' : ''}`} onClick={record} title="Enregistrer (R)">
              ●
            </button>
            <button className={`dw-tbtn dw-loop-btn ${proj.loop.on ? 'lit' : ''}`} onClick={() => setP({ loop: { ...proj.loop, on: !proj.loop.on } })} title="Boucle (L)">
              🔁
            </button>
            <div className="dw-time" ref={timeRef} />
            <div className="dw-master-meter" title="Niveau de sortie">
              <Meter id="L" />
              <Meter id="R" />
            </div>
          </div>

          <div className="dw-group dw-tempo">
            <label className="dw-field tempo" title="Tempo">
              <BpmInput value={proj.bpm} onChange={(bpm) => setP({ bpm }, 'bpm')} />
              BPM
            </label>
            <select className="dw-select" value={proj.timeSig.join('/')} onChange={(e) => setP({ timeSig: e.target.value.split('/').map(Number) as [number, number] })} title="Mesure">
              {['4/4', '3/4', '2/4', '6/8', '5/4', '7/8', '12/8'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className={`dw-tbtn sm ${proj.metronome ? 'lit' : ''}`} onClick={() => setP({ metronome: !proj.metronome })} title="Métronome (K)">
              𝅘𝅥
            </button>
            <select className="dw-select" value={proj.countIn} onChange={(e) => setP({ countIn: +e.target.value })} title="Décompte avant d’enregistrer">
              <option value={0}>Sans décompte</option>
              <option value={1}>Décompte 1 mesure</option>
              <option value={2}>Décompte 2 mesures</option>
            </select>
          </div>

          <div className="dw-group">
            <select className="dw-select" value={snapSel} onChange={(e) => setSnapSel(e.target.value)} title="Magnétisme de la grille">
              <option value="bar">Grille : mesure</option>
              <option value="1">Grille : 1/4</option>
              <option value="0.5">Grille : 1/8</option>
              <option value="0.25">Grille : 1/16</option>
              <option value="0.125">Grille : 1/32</option>
              <option value={String(1 / 3)}>Grille : triolet</option>
              <option value="0">Grille libre</option>
            </select>
            <button className="dw-icon" onClick={() => setPpb((x) => Math.max(3, x / 1.25))} title="Dézoomer (−)">
              −
            </button>
            <button className="dw-icon" onClick={() => setPpb((x) => Math.min(240, x * 1.25))} title="Zoomer (+)">
              +
            </button>
          </div>

          <span className="dw-spacer" />
          <SaveStatus state={saveState} />
          <button className={`dw-btn ${browser ? 'accent' : ''}`} onClick={() => setBrowser((b) => !b)} title="Banque de sons et de boucles (B)">
            🎼 Sons
          </button>
          <button className="dw-btn" onClick={() => (setTour(false), setLesson(true))} title="Leçon pas à pas : créer une musique de zéro">
            🎓 Leçon
          </button>
          <button className="dw-icon" onClick={() => (setLesson(false), setTour(true))} title="Visite guidée avec Minion">
            ?
          </button>
          <button className="dw-btn dw-export-btn" onClick={() => setExporting(true)}>
            ⬇ Exporter
          </button>
        </header>

        {armedAudio && inputs.length > 1 && (
          <div className="dw-inputbar">
            🎙️ Entrée :
            <select className="dw-select" value={engine.inputDeviceId ?? ''} onChange={(e) => engine.enableInput(e.target.value || undefined).catch(() => toast('Ce micro ne répond pas.'))}>
              <option value="">Micro par défaut</option>
              {inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Micro'}
                </option>
              ))}
            </select>
            <label className="dw-field" title="Décale les prises si elles arrivent en retard ou en avance">
              Latence
              <input type="number" value={proj.latencyMs ?? 0} step={5} onChange={(e) => setP({ latencyMs: +e.target.value }, 'lat')} onKeyDown={(e) => e.stopPropagation()} />
              ms
            </label>
          </div>
        )}

        <div className="dw-main">
          <Arrange
            project={proj}
            engine={engine}
            ppb={ppb}
            setPpb={setPpb}
            snap={snap}
            selTrack={selTrack}
            selClips={selClips}
            setSelTrack={(id) => {
              setSelTrack(id)
              if (id) setFxTarget(id)
            }}
            setSelClips={setSelClips}
            update={update}
            onEditClip={openEditor}
            onAddTrack={(k) => addTrack(k)}
            onImport={importFiles}
            onDropLoop={addLoop}
            onDropSound={(s, tid) => assignSound(s, tid)}
            onPickSound={(tid) => {
              setBrowserFor(tid)
              setBrowser(true)
            }}
            playing={tstate !== 'stopped'}
          />
          {browser && (
            <Browser
              target={proj.tracks.find((t) => t.id === (browserFor ?? selTrack)) ?? null}
              onPickSound={(s) => assignSound(s)}
              onPickLoop={(l) => addLoop(l, null)}
              onPreview={(s) => engine.preview(s)}
              onPreviewLoop={previewLoop}
              onClose={() => {
                setBrowser(false)
                setBrowserFor(null)
              }}
            />
          )}
        </div>

        <div className="dw-panel" style={{ height: panel ? panelH : 34 }}>
          <div className="dw-tabs">
            {panel && <div className="dw-resize" onPointerDown={resizePanel} title="Glisser pour agrandir" />}
            {(
              [
                ['editor', 'Éditeur'],
                ['mixer', 'Mixeur'],
                ['fx', 'Effets'],
                ['keys', 'Clavier'],
              ] as [Panel, string][]
            ).map(([id, label]) => (
              <button key={id} className={panel === id ? 'on' : ''} onClick={() => setPanel(panel === id ? null : id)}>
                {label}
              </button>
            ))}
            <span className="dw-spacer" />
            <button className="dw-icon" onClick={() => pickFiles('audio/*', true).then((f) => importFiles(f, selTrack, Math.max(0, engine.position())))} title="Importer un fichier audio (mp3, wav…)">
              📂 Importer un son
            </button>
            <button className="dw-icon" onClick={() => setPanel(panel ? null : 'editor')} title={panel ? 'Replier' : 'Déplier'}>
              {panel ? '▾' : '▴'}
            </button>
          </div>
          {panel && (
            <div className="dw-panel-body">
              {panel === 'editor' &&
                (editing ? (
                  editing.c.audioId ? (
                    <AudioClipPanel clip={editing.c} track={editing.t} bpm={proj.bpm} update={update} playhead={() => engine.position()} />
                  ) : (
                    <PianoRoll
                      clip={editing.c}
                      track={editing.t}
                      bpm={proj.bpm}
                      bpb={bpb}
                      snap={snap}
                      engine={engine}
                      onChange={(c, merge) => update((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === editing.t.id ? { ...t, clips: t.clips.map((x) => (x.id === c.id ? c : x)) } : t)) }), merge)}
                    />
                  )
                ) : (
                  <div className="dw-empty">
                    Double-clique sur un clip pour l’éditer ici. Sur une piste d’instrument, double-clique dans le vide pour créer un clip de notes.
                  </div>
                ))}
              {panel === 'mixer' && <Mixer project={proj} update={update} selTrack={selTrack} setSelTrack={setSelTrack} onFx={(t) => (setFxTarget(t), setPanel('fx'))} />}
              {panel === 'fx' && <FxRack project={proj} target={proj.tracks.some((t) => t.id === fxTarget) ? fxTarget : 'master'} setTarget={setFxTarget} update={update} />}
              {panel === 'keys' && (
                <Keys
                  octave={octave}
                  setOctave={setOctave}
                  velocity={velocity}
                  setVelocity={setVelocity}
                  kbd={kbd}
                  setKbd={setKbd}
                  held={held}
                  onDown={(p) => noteDown(p)}
                  onUp={noteUp}
                  midi={midiName}
                  onMidi={connectMidi}
                  trackName={liveTrack?.name ?? null}
                />
              )}
            </div>
          )}
        </div>

        {tour && <Tour steps={tourSteps} onClose={closeTour} />}
        {lesson && <Tour steps={lessonList} onClose={closeLesson} skipLabel="Quitter la leçon" finishLabel="Terminer la leçon" />}
        {(busy || loading) && <div className="dw-busy">{busy ?? 'Chargement des sons…'}</div>}

        <Modal open={exporting} onClose={() => setExporting(false)} title="Exporter le morceau" width={480}>
          <div className="dw-export">
            <button className="dw-export-opt" onClick={() => doExport('mix')} disabled={!!busy}>
              <b>🎧 Le morceau entier</b>
              <span>Un fichier WAV de qualité studio (44,1 kHz), avec tous les effets.</span>
            </button>
            <button className="dw-export-opt" onClick={() => doExport('loop')} disabled={!!busy || !proj.loop.on}>
              <b>🔁 Seulement la boucle</b>
              <span>{proj.loop.on ? `Mesures ${Math.floor(proj.loop.start / bpb) + 1} à ${Math.ceil(proj.loop.end / bpb)}.` : 'Active d’abord une boucle.'}</span>
            </button>
            <button className="dw-export-opt" onClick={() => doExport('stems')} disabled={!!busy}>
              <b>🎚️ Chaque piste séparément</b>
              <span>Un WAV par piste, pour mixer ailleurs.</span>
            </button>
          </div>
        </Modal>
      </div>
    </PlayheadCtx.Provider>
  )
}

/** Tempo : on tape librement, la valeur n'est appliquée (et bornée 30–260) qu'une fois le nombre complet. */
function BpmInput({ value, onChange }: { value: number; onChange: (bpm: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])
  const commit = () => {
    const v = Math.round(+draft)
    if (draft.trim() && Number.isFinite(v)) onChange(Math.max(30, Math.min(260, v)))
    setEditing(false)
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      value={editing ? draft : String(value)}
      onFocus={(e) => {
        setEditing(true)
        setDraft(String(value))
        e.target.select()
      }}
      onChange={(e) => {
        const d = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
        setDraft(d)
        // appliqué dès que le nombre est plausible, sans jamais forcer pendant la saisie
        const v = +d
        if (v >= 30 && v <= 260) onChange(v)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const v = Math.max(30, Math.min(260, (+draft || value) + (e.key === 'ArrowUp' ? 1 : -1)))
          setDraft(String(v))
          onChange(v)
        }
      }}
    />
  )
}

function formatTime(beat: number, p: DawProject) {
  const bpb = beatsPerBar(p.timeSig)
  if (beat < -1e-6) return `<b class="countin">Décompte ${Math.ceil(-beat / bpb - 1e-6) > 0 ? Math.ceil(-beat) : ''}</b><small>prépare-toi</small>`
  const bar = Math.floor(beat / bpb) + 1
  const b = Math.floor(beat % bpb) + 1
  const six = Math.floor((beat % 1) * 4) + 1
  const sec = (beat * 60) / p.bpm
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1).padStart(4, '0')
  return `<b>${bar}.${b}.${six}</b><small>${m}:${s}</small>`
}

