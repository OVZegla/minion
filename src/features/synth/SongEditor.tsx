import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../../db/db'
import type { Hand, Song, SongNote } from '../../db/types'
import { Icon } from '../../components/Icon'
import { LinkedItems } from '../../components/Linked'
import { Modal, SaveStatus, useAutosave, useUI } from '../../components/ui'
import { synth, Player } from './audio'
import { Keyboard, type KeyMark } from './Keyboard'
import { PianoRoll, makeNote } from './PianoRoll'
import { COMPUTER_KEYS, DURATIONS, beatsPerMeasure, durationLabel, noteName, songLength } from './music'
import { KeyboardMarksView, NoteGridView, StaffView } from './views'
import { PrintDialog } from './PrintSong'
import './synth.css'

export function SongEditorPage() {
  const { id } = useParams()
  const s = useLiveQuery(() => db.songs.get(id!), [id])
  if (s === undefined) return null
  if (!s)
    return (
      <div className="page narrow empty">
        <span className="hand">Introuvable</span>Ce morceau n’existe plus.
      </div>
    )
  return <Editor key={s.id} initial={s} />
}

type ViewKind = 'roll' | 'grid' | 'keys' | 'staff'
const VIEW_LABEL: Record<ViewKind, string> = { roll: 'Piano roll', grid: 'Grille de notes', keys: 'Repères clavier', staff: 'Portée' }

function Editor({ initial }: { initial: Song }) {
  const navigate = useNavigate()
  const { toast, confirm } = useUI()
  const [song, setSong] = useState<Song>(initial)
  const [view, setView] = useState<ViewKind>(() => (localStorage.getItem('minion:songView') as ViewKind) ?? 'roll')
  const [sel, setSel] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [dur, setDur] = useState(1)
  const [dotted, setDotted] = useState(false)
  const [hand, setHand] = useState<Hand>('R')
  const [finger, setFinger] = useState<number | null>(null)
  const [chordMode, setChordMode] = useState(false)
  const [octave, setOctave] = useState(4) // octave du clavier de saisie (do = 12 × (octave + 1))
  const [pcKeys, setPcKeys] = useState(true)
  const [beatW, setBeatW] = useState(56)
  const [snap, setSnap] = useState(0.25)
  const [selMeasure, setSelMeasure] = useState<number | null>(null)
  const [clip, setClip] = useState<SongNote[] | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [labelModal, setLabelModal] = useState<null | 'section' | 'chord' | 'annotation'>(null)
  const [labelText, setLabelText] = useState('')

  // lecture
  const player = useRef(new Player())
  const [isPlaying, setIsPlaying] = useState(false)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [practice, setPractice] = useState(initial.bpm)
  const [metronome, setMetronome] = useState(false)
  const [countIn, setCountIn] = useState(false)
  const [loop, setLoop] = useState(false)
  const [loopRange, setLoopRange] = useState<[number, number]>([0, Math.min(3, initial.measures - 1)])
  const [fromMeasure, setFromMeasure] = useState(0)
  const [mute, setMute] = useState<{ R?: boolean; L?: boolean }>({})

  const past = useRef<SongNote[][]>([])
  const future = useRef<SongNote[][]>([])

  const state = useAutosave(song, (s) =>
    db.songs.update(initial.id, {
      title: s.title,
      bpm: s.bpm,
      timeSig: s.timeSig,
      measures: s.measures,
      notes: s.notes,
      chords: s.chords,
      annotations: s.annotations,
      sections: s.sections,
      noteNames: s.noteNames,
      updatedAt: Date.now(),
    }),
  )
  useEffect(() => {
    db.songs.update(initial.id, { openedAt: Date.now() })
    const p = player.current
    return () => p.stop()
  }, [initial.id])
  useEffect(() => {
    try {
      localStorage.setItem('minion:songView', view)
    } catch {
      /* rien */
    }
  }, [view])

  const len = beatsPerMeasure(song.timeSig)
  const total = songLength(song)
  const noteDur = dotted ? dur * 1.5 : dur
  const set = (p: Partial<Song>) => setSong((s) => ({ ...s, ...p }))

  /* ---------- historique ---------- */
  // l'historique est mis à jour hors des fonctions de mise à jour d'état (qui peuvent être rejouées)
  const notesRef = useRef(song.notes)
  notesRef.current = song.notes
  const commit = useCallback((notes: SongNote[], before?: SongNote[]) => {
    past.current.push(before ?? notesRef.current)
    if (past.current.length > 150) past.current.shift()
    future.current = []
    notesRef.current = notes
    setSong((s) => ({ ...s, notes }))
  }, [])
  const live = (notes: SongNote[]) => setSong((s) => ({ ...s, notes }))
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(song.notes)
    live(prev)
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(song.notes)
    live(next)
  }

  /* ---------- saisie pas à pas ---------- */
  const preview = (pitch: number) => synth.note(pitch, synth.ensure().currentTime + 0.01, 0.35)

  const enter = (pitch: number) => {
    preview(pitch)
    let start = cursor
    if (start + noteDur > total + 1e-6) {
      // ajoute des mesures si on écrit au-delà de la fin
      const need = Math.ceil((start + noteDur - total) / len)
      set({ measures: song.measures + need })
    }
    const n = makeNote(pitch, start, noteDur, hand, finger)
    commit([...song.notes, n])
    setSel([n.id])
    if (!chordMode) setCursor(start + noteDur)
    start = 0
  }
  const enterRest = () => {
    const next = cursor + noteDur
    if (next > total + 1e-6) set({ measures: song.measures + Math.ceil((next - total) / len) })
    setCursor(next)
  }
  const backspace = () => {
    // retire la ou les notes qui finissent au curseur (dernière saisie), puis recule
    const ending = song.notes.filter((n) => Math.abs(n.start + n.dur - cursor) < 1e-6 && n.hand === hand)
    if (ending.length) {
      const start = Math.min(...ending.map((n) => n.start))
      const toRemove = ending.filter((n) => Math.abs(n.start - start) < 1e-6).map((n) => n.id)
      commit(song.notes.filter((n) => !toRemove.includes(n.id)))
      setCursor(start)
    } else setCursor(Math.max(0, cursor - noteDur))
  }

  /* ---------- édition de la sélection ---------- */
  const selected = song.notes.filter((n) => sel.includes(n.id))
  const one = selected.length === 1 ? selected[0] : null
  const patchSel = (f: (n: SongNote) => SongNote) => commit(song.notes.map((n) => (sel.includes(n.id) ? f(n) : n)))
  const deleteSel = () => {
    commit(song.notes.filter((n) => !sel.includes(n.id)))
    setSel([])
  }
  const copySel = () => {
    if (!selected.length) return
    const t0 = Math.min(...selected.map((n) => n.start))
    setClip(selected.map((n) => ({ ...n, start: n.start - t0 })))
    toast(`${selected.length} note${selected.length > 1 ? 's' : ''} copiée${selected.length > 1 ? 's' : ''}`)
  }
  const paste = (at = cursor) => {
    if (!clip?.length) return
    const span = Math.max(...clip.map((n) => n.start + n.dur))
    const extra = at + span > total ? Math.ceil((at + span - total) / len) : 0
    if (extra) set({ measures: song.measures + extra })
    const added = clip.map((n) => ({ ...n, id: uid(), start: n.start + at }))
    commit([...song.notes, ...added])
    setSel(added.map((n) => n.id))
    setCursor(at + span)
  }

  /* ---------- mesures ---------- */
  const measureNotes = (m: number) => song.notes.filter((n) => n.start >= m * len - 1e-6 && n.start < (m + 1) * len - 1e-6)
  const insertMeasure = (at: number) => {
    const shift = (b: number) => (b >= at * len - 1e-6 ? b + len : b)
    setSong((s) => ({
      ...s,
      measures: s.measures + 1,
      chords: s.chords.map((c) => ({ ...c, beat: shift(c.beat) })),
      annotations: s.annotations.map((a) => ({ ...a, beat: shift(a.beat) })),
      sections: s.sections.map((x) => ({ ...x, measure: x.measure >= at ? x.measure + 1 : x.measure })),
    }))
    commit(song.notes.map((n) => ({ ...n, start: shift(n.start) })))
  }
  const duplicateMeasure = (m: number) => {
    const src = measureNotes(m)
    insertMeasure(m + 1)
    // insertMeasure a décalé les notes après m ; on ajoute la copie
    commit([...notesRef.current, ...src.map((n) => ({ ...n, id: uid(), start: n.start + len }))])
  }
  const deleteMeasure = async (m: number) => {
    if (song.measures <= 1) return
    const count = measureNotes(m).length
    if (count && !(await confirm({ title: `Supprimer la mesure ${m + 1} ?`, message: `Ses ${count} note(s) seront retirées et la suite du morceau avancera d’une mesure.`, confirmLabel: 'Supprimer la mesure', danger: true }))) return
    const inM = (b: number) => b >= m * len - 1e-6 && b < (m + 1) * len - 1e-6
    const shift = (b: number) => (b >= (m + 1) * len - 1e-6 ? b - len : b)
    setSong((s) => ({
      ...s,
      measures: s.measures - 1,
      chords: s.chords.filter((c) => !inM(c.beat)).map((c) => ({ ...c, beat: shift(c.beat) })),
      annotations: s.annotations.filter((a) => !inM(a.beat)).map((a) => ({ ...a, beat: shift(a.beat) })),
      sections: s.sections.filter((x) => x.measure !== m).map((x) => ({ ...x, measure: x.measure > m ? x.measure - 1 : x.measure })),
    }))
    commit(song.notes.filter((n) => !inM(n.start)).map((n) => ({ ...n, start: shift(n.start) })))
    setSelMeasure(null)
  }
  const copyMeasure = (m: number) => {
    setClip(measureNotes(m).map((n) => ({ ...n, start: n.start - m * len })))
    toast(`Mesure ${m + 1} copiée`)
  }

  const addLabel = () => {
    const t = labelText.trim()
    if (!t || !labelModal) return
    const beat = selMeasure != null ? selMeasure * len : cursor
    if (labelModal === 'section') set({ sections: [...song.sections.filter((s) => s.measure !== Math.floor(beat / len)), { id: uid(), measure: Math.floor(beat / len), name: t }] })
    if (labelModal === 'chord') set({ chords: [...song.chords, { id: uid(), beat: cursor, name: t }] })
    if (labelModal === 'annotation') set({ annotations: [...song.annotations, { id: uid(), beat: cursor, text: t }] })
    setLabelModal(null)
    setLabelText('')
  }

  /* ---------- lecture ---------- */
  const play = () => {
    const p = player.current
    if (p.playing) {
      p.stop()
      setIsPlaying(false)
      return
    }
    const from = loop ? loopRange[0] * len : fromMeasure * len
    const to = loop ? (loopRange[1] + 1) * len : total
    p.onEnd = () => {
      setIsPlaying(false)
      setPlayhead(null)
    }
    p.start(song, { fromBeat: from, toBeat: to, loop, practiceBpm: practice, metronome, countIn, mute })
    setIsPlaying(true)
    db.songs.update(initial.id, { lastPracticeAt: Date.now() })
  }
  const stop = () => {
    player.current.stop()
    setIsPlaying(false)
    setPlayhead(null)
  }
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const loopFn = () => {
      const pos = player.current.position()
      setPlayhead(pos >= (loop ? loopRange[0] * len : fromMeasure * len) ? pos : null)
      raf = requestAnimationFrame(loopFn)
    }
    raf = requestAnimationFrame(loopFn)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, loop, loopRange, fromMeasure, len])
  useEffect(() => {
    player.current.setTempo(practice)
  }, [practice])

  const playingIds = useMemo(() => {
    const s = new Set<string>()
    if (playhead == null) return s
    song.notes.forEach((n) => n.start <= playhead + 1e-3 && n.start + n.dur > playhead + 1e-3 && s.add(n.id))
    return s
  }, [playhead, song.notes])

  /* ---------- clavier d'ordinateur ---------- */
  const held = useRef(new Set<string>())
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const ctrl = e.ctrlKey || e.metaKey
      if (e.code === 'Space') {
        e.preventDefault()
        play()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) return (e.preventDefault(), undo())
      if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) return (e.preventDefault(), redo())
      if (ctrl && e.key.toLowerCase() === 'c') return (e.preventDefault(), copySel())
      if (ctrl && e.key.toLowerCase() === 'v') return (e.preventDefault(), paste())
      if (ctrl && e.key.toLowerCase() === 'a') return (e.preventDefault(), setSel(song.notes.map((n) => n.id)))
      if (ctrl && e.key.toLowerCase() === 'd' && selected.length) {
        e.preventDefault()
        const span = Math.max(...selected.map((n) => n.start + n.dur)) - Math.min(...selected.map((n) => n.start))
        const added = selected.map((n) => ({ ...n, id: uid(), start: n.start + span }))
        commit([...song.notes, ...added])
        setSel(added.map((n) => n.id))
        return
      }
      if (e.key === 'Delete') return sel.length ? deleteSel() : undefined
      if (e.key === 'Backspace') return (e.preventDefault(), sel.length ? deleteSel() : backspace())
      if (e.key === 'Escape') return setSel([])
      if (sel.length && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)
        patchSel((n) => ({ ...n, pitch: Math.max(21, Math.min(108, n.pitch + d)) }))
        if (one) preview(Math.max(21, Math.min(108, one.pitch + d)))
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const d = (e.key === 'ArrowRight' ? 1 : -1) * snap
        if (sel.length) patchSel((n) => ({ ...n, start: Math.max(0, Math.min(total - n.dur, n.start + d)) }))
        else setCursor((c) => Math.max(0, Math.min(total, c + d)))
        return
      }
      if (!ctrl && !e.altKey && DURATIONS.some((x) => x.key === e.key) && !pcKeys) {
        setDur(DURATIONS.find((x) => x.key === e.key)!.v)
        return
      }
      if (pcKeys && !ctrl && !e.altKey && e.code in COMPUTER_KEYS) {
        e.preventDefault()
        if (held.current.has(e.code)) return
        held.current.add(e.code)
        enter(12 * (octave + 1) + COMPUTER_KEYS[e.code])
        return
      }
      if (pcKeys && (e.code === 'KeyZ' || e.code === 'KeyX') && !ctrl) setOctave((o) => Math.max(1, Math.min(7, o + (e.code === 'KeyX' ? 1 : -1))))
    }
    const onUp = (e: KeyboardEvent) => held.current.delete(e.code)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  })

  const inputMarks = useMemo(() => {
    const m = new Map<number, KeyMark>()
    selected.forEach((n) => m.set(n.pitch, 'sel'))
    song.notes.filter((n) => playingIds.has(n.id)).forEach((n) => m.set(n.pitch, 'now'))
    return m
  }, [selected, playingIds, song.notes])

  const onMeasureClick = (m: number) => {
    setSelMeasure(m)
    setCursor(m * len)
    if (!isPlaying) setFromMeasure(m)
  }

  const pcHint = usePcHint()
  const viewProps = { song, playhead, playing: playingIds, onMeasure: onMeasureClick }
  const kbLo = 12 * (octave + 1) - 12 < 21 ? 21 : 12 * octave
  const kbHi = Math.min(108, 12 * (octave + 2) + 4)

  return (
    <div className="se">
      {/* ---- En-tête ---- */}
      <header className="se-top">
        <button className="btn ghost sm" onClick={() => navigate('/synthe')} aria-label="Retour aux morceaux">
          <Icon name="chevronLeft" size={16} />
        </button>
        <input className="se-title" value={song.title} placeholder="Titre du morceau" onChange={(e) => set({ title: e.target.value })} />
        <label className="se-field" title="Tempo de référence">
          <span>♩ =</span>
          <input type="number" min={20} max={300} value={song.bpm} onChange={(e) => set({ bpm: Math.max(20, Math.min(300, +e.target.value || 0)) })} />
          <span className="faint">BPM</span>
        </label>
        <label className="se-field" title="Mesure">
          <select
            value={song.timeSig.join('/')}
            onChange={(e) => {
              const [a, b] = e.target.value.split('/').map(Number)
              set({ timeSig: [a, b] })
            }}
          >
            {['2/4', '3/4', '4/4', '5/4', '6/8', '9/8', '12/8'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="seg">
          <button className={song.noteNames === 'fr' ? 'on' : ''} onClick={() => set({ noteNames: 'fr' })}>
            Do Ré Mi
          </button>
          <button className={song.noteNames === 'en' ? 'on' : ''} onClick={() => set({ noteNames: 'en' })}>
            C D E
          </button>
        </div>
        <SaveStatus state={state} />
        <span className="spacer" />
        <button className="btn ghost icon sm" onClick={undo} title="Annuler (Ctrl+Z)" aria-label="Annuler">
          <Icon name="undo" size={17} />
        </button>
        <button className="btn ghost icon sm" onClick={redo} title="Rétablir (Ctrl+Y)" aria-label="Rétablir">
          <Icon name="redo" size={17} />
        </button>
        <button className="btn sm" onClick={() => setPrintOpen(true)}>
          <Icon name="printer" size={15} /> Imprimer / PDF
        </button>
      </header>

      {/* ---- Transport ---- */}
      <div className="se-transport">
        <button className={`se-play ${isPlaying ? 'on' : ''}`} onClick={play} aria-label={isPlaying ? 'Pause' : 'Lecture'} title="Lecture / pause (Espace)">
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button className="btn ghost icon sm" onClick={stop} aria-label="Stop" title="Stop">
          ■
        </button>
        <label className="se-field">
          <span>Départ mesure</span>
          <input type="number" min={1} max={song.measures} value={fromMeasure + 1} onChange={(e) => setFromMeasure(Math.max(0, Math.min(song.measures - 1, +e.target.value - 1)))} disabled={loop} />
        </label>
        <label className={`se-toggle ${loop ? 'on' : ''}`}>
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Boucle
        </label>
        {loop && (
          <span className="se-field">
            <input type="number" min={1} max={song.measures} value={loopRange[0] + 1} onChange={(e) => setLoopRange([Math.max(0, Math.min(loopRange[1], +e.target.value - 1)), loopRange[1]])} />
            <span>à</span>
            <input type="number" min={1} max={song.measures} value={loopRange[1] + 1} onChange={(e) => setLoopRange([loopRange[0], Math.max(loopRange[0], Math.min(song.measures - 1, +e.target.value - 1))])} />
          </span>
        )}
        <label className="se-tempo" title="Tempo de pratique : ne change pas le tempo de référence">
          <span>Pratique</span>
          <input type="range" min={Math.round(song.bpm * 0.3)} max={Math.round(song.bpm * 1.5)} value={practice} onChange={(e) => setPractice(+e.target.value)} />
          <b>{practice}</b>
          <span className="faint">({Math.round((practice / song.bpm) * 100)} %)</span>
          {practice !== song.bpm && (
            <button className="btn ghost sm" onClick={() => setPractice(song.bpm)}>
              Réf.
            </button>
          )}
        </label>
        <label className={`se-toggle ${metronome ? 'on' : ''}`}>
          <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} /> Métronome
        </label>
        <label className={`se-toggle ${countIn ? 'on' : ''}`}>
          <input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} /> Décompte
        </label>
        <label className={`se-toggle ${mute.L ? 'on' : ''}`} title="Couper la main gauche (pour la jouer soi-même)">
          <input type="checkbox" checked={!!mute.L} onChange={(e) => setMute({ ...mute, L: e.target.checked })} /> Muet MG
        </label>
        <label className={`se-toggle ${mute.R ? 'on' : ''}`} title="Couper la main droite (pour la jouer soi-même)">
          <input type="checkbox" checked={!!mute.R} onChange={(e) => setMute({ ...mute, R: e.target.checked })} /> Muet MD
        </label>
      </div>

      {/* ---- Formats ---- */}
      <div className="se-views">
        <span className="se-views-label">Format affiché :</span>
        <div className="seg">
          {(Object.keys(VIEW_LABEL) as ViewKind[]).map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        {view === 'roll' && (
          <>
            <span className="spacer" />
            <label className="se-field">
              <span>Grille</span>
              <select value={snap} onChange={(e) => setSnap(+e.target.value)}>
                <option value={1}>1 temps</option>
                <option value={0.5}>½ temps</option>
                <option value={0.25}>¼ temps</option>
              </select>
            </label>
            <button className="btn ghost icon sm" aria-label="Dézoomer" onClick={() => setBeatW((w) => Math.max(20, w / 1.25))}>
              <Icon name="zoomOut" size={16} />
            </button>
            <button className="btn ghost icon sm" aria-label="Zoomer" onClick={() => setBeatW((w) => Math.min(200, w * 1.25))}>
              <Icon name="zoomIn" size={16} />
            </button>
          </>
        )}
      </div>

      <div className="se-main">
        <div className="se-stage">
          {view === 'roll' && (
            <PianoRoll
              song={song}
              beatW={beatW}
              snap={snap}
              sel={sel}
              setSel={setSel}
              cursor={cursor}
              setCursor={setCursor}
              playhead={playhead}
              playing={playingIds}
              live={live}
              commit={commit}
              newNote={(pitch, start) => {
                preview(pitch)
                return makeNote(pitch, start, Math.min(noteDur, total - start), hand, finger)
              }}
              onMeasureClick={onMeasureClick}
              selectedMeasure={selMeasure}
              loopRange={loop ? loopRange : null}
            />
          )}
          {view === 'grid' && (
            <div className="se-scroll">
              <NoteGridView {...viewProps} />
            </div>
          )}
          {view === 'keys' && (
            <div className="se-scroll">
              <KeyboardMarksView {...viewProps} />
            </div>
          )}
          {view === 'staff' && (
            <div className="se-scroll">
              <StaffView {...viewProps} />
            </div>
          )}
        </div>

        {/* ---- Inspecteur ---- */}
        <aside className="se-side">
          {selMeasure != null && (
            <div className="se-box">
              <div className="row">
                <b>Mesure {selMeasure + 1}</b>
                <span className="spacer" />
                <button className="btn ghost icon sm" aria-label="Fermer" onClick={() => setSelMeasure(null)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
              <div className="se-actions">
                <button className="btn sm" onClick={() => insertMeasure(selMeasure)}>Insérer avant</button>
                <button className="btn sm" onClick={() => insertMeasure(selMeasure + 1)}>Insérer après</button>
                <button className="btn sm" onClick={() => duplicateMeasure(selMeasure)}>Dupliquer</button>
                <button className="btn sm" onClick={() => copyMeasure(selMeasure)}>Copier</button>
                <button className="btn sm" onClick={() => paste(selMeasure * len)} disabled={!clip}>Coller ici</button>
                <button className="btn sm" onClick={() => setSel(measureNotes(selMeasure).map((n) => n.id))}>Sélectionner les notes</button>
                <button className="btn sm" onClick={() => { setLabelModal('section'); setLabelText(song.sections.find((s) => s.measure === selMeasure)?.name ?? '') }}>Section ici</button>
                <button className="btn sm danger" onClick={() => deleteMeasure(selMeasure)}>Supprimer</button>
              </div>
            </div>
          )}

          {selected.length > 0 && (
            <div className="se-box">
              <b>{one ? noteName(one.pitch, song.noteNames) : `${selected.length} notes`}</b>
              {one && (
                <p className="faint" style={{ fontSize: '0.8rem', margin: '2px 0 8px' }}>
                  Mesure {Math.floor(one.start / len) + 1}, temps {Math.round(((one.start % len) + 1) * 100) / 100} · {durationLabel(one.dur)}
                </p>
              )}
              <div className="se-row">
                <span>Main</span>
                <div className="seg sm">
                  <button className={selected.every((n) => n.hand === 'R') ? 'on' : ''} onClick={() => patchSel((n) => ({ ...n, hand: 'R' }))}>Droite</button>
                  <button className={selected.every((n) => n.hand === 'L') ? 'on' : ''} onClick={() => patchSel((n) => ({ ...n, hand: 'L' }))}>Gauche</button>
                </div>
              </div>
              <div className="se-row">
                <span>Durée</span>
                <select value={one?.dur ?? ''} onChange={(e) => patchSel((n) => ({ ...n, dur: +e.target.value }))}>
                  {!one && <option value="">—</option>}
                  {DURATIONS.flatMap((d) => [d.v, d.v * 1.5]).filter((v) => v <= 6).sort((a, b) => b - a).map((v) => (
                    <option key={v} value={v}>{durationLabel(v)}</option>
                  ))}
                </select>
              </div>
              <div className="se-row">
                <span>Doigt</span>
                <div className="seg sm">
                  {[null, 1, 2, 3, 4, 5].map((f) => (
                    <button key={String(f)} className={one && (one.finger ?? null) === f ? 'on' : ''} onClick={() => patchSel((n) => ({ ...n, finger: f }))}>
                      {f ?? '–'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="se-actions" style={{ marginTop: 8 }}>
                <button className="btn sm" onClick={() => patchSel((n) => ({ ...n, pitch: Math.min(108, n.pitch + 12) }))}>Octave +</button>
                <button className="btn sm" onClick={() => patchSel((n) => ({ ...n, pitch: Math.max(21, n.pitch - 12) }))}>Octave −</button>
                <button className="btn sm" onClick={copySel}>Copier</button>
                <button className="btn sm danger" onClick={deleteSel}>Supprimer</button>
              </div>
            </div>
          )}

          <div className="se-box">
            <b>Repères</b>
            <div className="se-actions" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => { setLabelModal('chord'); setLabelText('') }}>+ Accord (Am, C…)</button>
              <button className="btn sm" onClick={() => { setLabelModal('annotation'); setLabelText('') }}>+ Annotation</button>
            </div>
            <p className="faint" style={{ fontSize: '0.76rem', marginTop: 6 }}>Ajoutés à la position du curseur (mesure {Math.floor(cursor / len) + 1}).</p>
            {[...song.chords.map((c) => ({ ...c, label: c.name, kind: 'chords' as const })), ...song.annotations.map((a) => ({ ...a, label: a.text, kind: 'annotations' as const }))]
              .sort((a, b) => a.beat - b.beat)
              .map((x) => (
                <div key={x.id} className="se-mark">
                  <span className="faint">m.{Math.floor(x.beat / len) + 1}</span>
                  <span style={{ flex: 1 }}>{x.kind === 'chords' ? <b>{x.label}</b> : x.label}</span>
                  <button className="btn ghost icon sm" aria-label="Retirer" onClick={() => set({ [x.kind]: (song[x.kind] as { id: string }[]).filter((y) => y.id !== x.id) } as Partial<Song>)}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            {song.sections.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {[...song.sections].sort((a, b) => a.measure - b.measure).map((s) => (
                  <div key={s.id} className="se-mark">
                    <span className="faint">m.{s.measure + 1}</span>
                    <span style={{ flex: 1 }} className="hand">{s.name}</span>
                    <button className="btn ghost icon sm" aria-label="Retirer la section" onClick={() => set({ sections: song.sections.filter((y) => y.id !== s.id) })}>
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="se-box">
            <LinkedItems type="song" id={initial.id} title="Relié à" />
          </div>
        </aside>
      </div>

      {/* ---- Saisie ---- */}
      <div className="se-input">
        <div className="se-input-bar">
          <div className="seg sm" role="group" aria-label="Durée">
            {DURATIONS.map((d) => (
              <button key={d.v} className={dur === d.v ? 'on' : ''} onClick={() => setDur(d.v)} title={`${d.label}${pcKeys ? '' : ` (${d.key})`}`}>
                <span className="se-glyph">{d.short}</span> {d.label}
              </button>
            ))}
          </div>
          <label className={`se-toggle ${dotted ? 'on' : ''}`} title="Note pointée (+ moitié de sa durée)">
            <input type="checkbox" checked={dotted} onChange={(e) => setDotted(e.target.checked)} /> Pointée
          </label>
          <div className="seg sm" role="group" aria-label="Main">
            <button className={hand === 'R' ? 'on' : ''} onClick={() => setHand('R')}>Main droite</button>
            <button className={hand === 'L' ? 'on' : ''} onClick={() => setHand('L')}>Main gauche</button>
          </div>
          <select className="se-small-select" value={finger ?? ''} onChange={(e) => setFinger(e.target.value ? +e.target.value : null)} title="Doigté des prochaines notes">
            <option value="">Doigt –</option>
            {[1, 2, 3, 4, 5].map((f) => <option key={f} value={f}>Doigt {f}</option>)}
          </select>
          <label className={`se-toggle ${chordMode ? 'on' : ''}`} title="Les notes s’empilent au même endroit">
            <input type="checkbox" checked={chordMode} onChange={(e) => setChordMode(e.target.checked)} /> Accord
          </label>
          <button className="btn sm" onClick={enterRest} title="Avance le curseur sans note">𝄽 Silence</button>
          <button className="btn sm" onClick={backspace} title="Retire la dernière note saisie (Retour arrière)">⌫ Effacer</button>
          <span className="spacer" />
          <span className="faint se-cursor-info">
            Curseur : mesure {Math.floor(cursor / len) + 1}, temps {Math.round(((cursor % len) + 1) * 100) / 100} · {durationLabel(noteDur)}
          </span>
        </div>
        <div className="se-kb-row">
          <button className="btn ghost icon sm" aria-label="Octave plus grave" onClick={() => setOctave((o) => Math.max(1, o - 1))}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <Keyboard lo={kbLo} hi={kbHi} marks={inputMarks} onPress={enter} lang={song.noteNames} showNames="c" height={96} />
          </div>
          <button className="btn ghost icon sm" aria-label="Octave plus aiguë" onClick={() => setOctave((o) => Math.min(7, o + 1))}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        <label className="faint se-pc">
          <input type="checkbox" checked={pcKeys} onChange={(e) => setPcKeys(e.target.checked)} /> Jouer avec le clavier de l’ordinateur ({pcHint})
        </label>
      </div>

      {printOpen && <PrintDialog song={song} onClose={() => setPrintOpen(false)} />}

      <Modal
        open={!!labelModal}
        onClose={() => setLabelModal(null)}
        title={labelModal === 'section' ? 'Nom de la section' : labelModal === 'chord' ? 'Accord' : 'Annotation'}
        width={380}
        footer={
          <>
            <button className="btn ghost" onClick={() => setLabelModal(null)}>Annuler</button>
            <button className="btn primary" onClick={addLabel} disabled={!labelText.trim()}>Ajouter</button>
          </>
        }
      >
        {labelModal === 'section' && (
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            {['Introduction', 'Couplet', 'Refrain', 'Pont', 'Final'].map((s) => (
              <button key={s} className="chip neutral" onClick={() => setLabelText(s)}>{s}</button>
            ))}
          </div>
        )}
        <input className="input" autoFocus value={labelText} placeholder={labelModal === 'chord' ? 'Am, C, G7…' : labelModal === 'annotation' ? 'Doucement, crescendo…' : 'Couplet 1'} onChange={(e) => setLabelText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLabel()} />
      </Modal>
    </div>
  )
}


/** Libellés réels des touches (AZERTY, QWERTY…) quand le navigateur sait les donner. */
function usePcHint() {
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard
    kb?.getLayoutMap?.()
      .then((m) => setLabels(Object.fromEntries(['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyZ', 'KeyX'].map((c) => [c, (m.get(c) ?? '').toUpperCase()]))))
      .catch(() => {})
  }, [])
  const azerty = navigator.language.startsWith('fr')
  const L = labels ?? (azerty ? { KeyA: 'Q', KeyW: 'Z', KeyS: 'S', KeyE: 'E', KeyD: 'D', KeyF: 'F', KeyT: 'T', KeyG: 'G', KeyY: 'Y', KeyH: 'H', KeyU: 'U', KeyJ: 'J', KeyK: 'K', KeyZ: 'W', KeyX: 'X' } : { KeyA: 'A', KeyW: 'W', KeyS: 'S', KeyE: 'E', KeyD: 'D', KeyF: 'F', KeyT: 'T', KeyG: 'G', KeyY: 'Y', KeyH: 'H', KeyU: 'U', KeyJ: 'J', KeyK: 'K', KeyZ: 'Z', KeyX: 'X' })
  const k = (codes: string[]) => codes.map((c) => (L as Record<string, string>)[c]).join(' ')
  return `touches blanches ${k(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'])} · noires ${k(['KeyW', 'KeyE', 'KeyT', 'KeyY', 'KeyU'])} · octave ${L.KeyZ} / ${L.KeyX}`
}
