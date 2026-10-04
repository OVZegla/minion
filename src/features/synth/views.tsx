import { Fragment, useMemo, type ReactElement } from 'react'
import type { Song, SongNote } from '../../db/types'
import { Keyboard, type KeyMark } from './Keyboard'
import { beatsPerMeasure, decompose, durationLabel, groupByStart, isBlack, noteName, restsInMeasure, splitAtBars, type Piece } from './music'

export interface ViewProps {
  song: Song
  playhead: number | null
  playing: Set<string>
  onMeasure?: (m: number) => void
  perLine?: number
  scale?: number
  showFingers?: boolean
  showAnnotations?: boolean
  print?: boolean
}

const measureNotes = (song: Song, m: number) => {
  const len = beatsPerMeasure(song.timeSig)
  return splitAtBars(song.notes, song.timeSig).filter((p) => p.start >= m * len - 1e-6 && p.start < (m + 1) * len - 1e-6)
}

function chunk<T>(arr: T[], n: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/* =========================================================
   1. Grille simplifiée avec les noms des notes
   ========================================================= */

export function NoteGridView({ song, playhead, playing, onMeasure, perLine = 4, scale = 1, showFingers = true, showAnnotations = true }: ViewProps) {
  const len = beatsPerMeasure(song.timeSig)
  const curM = playhead != null ? Math.floor(playhead / len) : -1
  const measures = Array.from({ length: song.measures }, (_, m) => m)
  const hasL = song.notes.some((n) => n.hand === 'L')

  return (
    <div className="ng" style={{ fontSize: `${scale}em` }}>
      {chunk(measures, perLine).map((line, li) => (
        <div key={li} className="ng-line" style={{ gridTemplateColumns: `auto repeat(${perLine}, 1fr)` }}>
          <div className="ng-hands">
            <span>MD</span>
            {hasL && <span>MG</span>}
          </div>
          {line.map((m) => {
            const pieces = measureNotes(song, m)
            const section = song.sections.find((s) => s.measure === m)
            const chords = song.chords.filter((c) => c.beat >= m * len && c.beat < (m + 1) * len)
            const notes = song.annotations.filter((a) => a.beat >= m * len && a.beat < (m + 1) * len)
            return (
              <div key={m} className={`ng-measure ${curM === m ? 'now' : ''}`} onClick={() => onMeasure?.(m)}>
                <div className="ng-top">
                  <span className="ng-num">{m + 1}</span>
                  {section && <span className="ng-section">{section.name}</span>}
                  {chords.map((c) => (
                    <span key={c.id} className="ng-chord" style={{ left: `${((c.beat - m * len) / len) * 100}%` }}>
                      {c.name}
                    </span>
                  ))}
                </div>
                {(['R', 'L'] as const)
                  .filter((h) => h === 'R' || hasL)
                  .map((h) => {
                    const ps = pieces.filter((p) => p.note.hand === h)
                    const groups = groupByStart(ps)
                    const rests = restsInMeasure(ps, m * len, len)
                    return (
                      <div key={h} className={`ng-row hand-${h}`}>
                        {groups.map((g) => (
                          <div
                            key={g.start}
                            className={`ng-cell ${g.items.some((p) => playing.has(p.note.id)) ? 'playing' : ''}`}
                            style={{ left: `${((g.start - m * len) / len) * 100}%`, width: `${(Math.max(...g.items.map((p) => p.dur)) / len) * 100}%` }}
                            title={durationLabel(g.items[0].dur)}
                          >
                            {[...g.items]
                              .sort((a, b) => b.note.pitch - a.note.pitch)
                              .map((p, k) => (
                                <span key={k} className="ng-name">
                                  {noteName(p.note.pitch, song.noteNames, false)}
                                  {showFingers && p.note.finger ? <sup>{p.note.finger}</sup> : null}
                                  {p.start > p.note.start + 1e-6 && <span className="ng-tie">⁀</span>}
                                </span>
                              ))}
                          </div>
                        ))}
                        {rests.map((r, k) => (
                          <div key={'r' + k} className="ng-rest" style={{ left: `${((r.start - m * len) / len) * 100}%`, width: `${(r.dur / len) * 100}%` }}>
                            –
                          </div>
                        ))}
                      </div>
                    )
                  })}
                {showAnnotations && notes.length > 0 && <div className="ng-annot">{notes.map((a) => a.text).join(' · ')}</div>}
                {curM === m && playhead != null && <div className="ng-playhead" style={{ left: `${((playhead - m * len) / len) * 100}%` }} />}
              </div>
            )
          })}
        </div>
      ))}
      <p className="faint ng-legend">Format : grille simplifiée · une case par mesure · « – » = silence · petit chiffre = doigt</p>
    </div>
  )
}

/* =========================================================
   2. Repères sur un clavier
   ========================================================= */

export function KeyboardMarksView({ song, playhead, playing, onMeasure, scale = 1, showFingers = true, print = false }: ViewProps) {
  const len = beatsPerMeasure(song.timeSig)
  const groups = useMemo(() => groupByStart(song.notes), [song.notes])
  const [lo, hi] = useMemo(() => {
    if (!song.notes.length) return [48, 72]
    const ps = song.notes.map((n) => n.pitch)
    const l = Math.min(...ps)
    const h = Math.max(...ps)
    return [Math.max(21, l - (l % 12)), Math.min(108, Math.max(h + (11 - (h % 12)), l - (l % 12) + 23))]
  }, [song.notes])

  // grand clavier « en direct » : notes jouées et suivantes
  const live = useMemo(() => {
    const m = new Map<number, KeyMark>()
    if (playhead == null) return m
    const next = groups.find((g) => g.start > playhead + 1e-3)
    next?.items.forEach((n) => m.set(n.pitch, 'next'))
    song.notes.filter((n) => playing.has(n.id)).forEach((n) => m.set(n.pitch, 'now'))
    return m
  }, [playhead, playing, groups, song.notes])

  return (
    <div className="kmv">
      {!print && (
        <div className="kmv-live">
          <Keyboard lo={lo} hi={hi} marks={live} lang={song.noteNames} showNames="marked" height={110} />
          <p className="faint" style={{ fontSize: '0.78rem', marginTop: 6 }}>
            Pendant la lecture : <span className="kmv-dot now" /> à jouer maintenant · <span className="kmv-dot next" /> ensuite
          </p>
        </div>
      )}
      <div className="kmv-cards" style={{ fontSize: `${scale}em` }}>
        {groups.map((g, i) => {
          const marks = new Map<number, KeyMark>()
          const fingers = new Map<number, number>()
          g.items.forEach((n) => {
            marks.set(n.pitch, n.hand)
            if (showFingers && n.finger) fingers.set(n.pitch, n.finger)
          })
          const m = Math.floor(g.start / len)
          const beatIn = g.start - m * len
          const now = g.items.some((n) => playing.has(n.id))
          const section = song.sections.find((s) => s.measure === m && Math.abs(beatIn) < 1e-6)
          return (
            <Fragment key={i}>
              {section && <div className="kmv-section">{section.name}</div>}
              <div className={`kmv-card ${now ? 'now' : ''}`} onClick={() => onMeasure?.(m)}>
                <div className="kmv-pos">
                  Mesure {m + 1} · temps {Math.round((beatIn + 1) * 100) / 100}
                </div>
                <Keyboard lo={lo} hi={hi} marks={marks} fingers={fingers} lang={song.noteNames} showNames="none" height={64} />
                <div className="kmv-names">
                  {[...g.items]
                    .sort((a, b) => b.pitch - a.pitch)
                    .map((n) => (
                      <span key={n.id} className={`hand-${n.hand}`}>
                        {noteName(n.pitch, song.noteNames)}
                      </span>
                    ))}
                </div>
                <div className="faint kmv-dur">{durationLabel(Math.max(...g.items.map((n) => n.dur)))}</div>
              </div>
            </Fragment>
          )
        })}
      </div>
      {groups.length === 0 && <p className="faint">Aucune note pour l’instant.</p>}
      <p className="faint ng-legend">Format : repères sur clavier · <span className="kmv-dot R" /> main droite · <span className="kmv-dot L" /> main gauche · chiffre = doigt</p>
    </div>
  )
}

/* =========================================================
   3. Partition sur portée (grand-portée : sol pour la main droite, fa pour la gauche)
   ========================================================= */

const G = 10 // écart entre deux lignes
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] // do do# ré ré# mi fa fa# sol sol# la la# si
const diat = (midi: number) => Math.floor(midi / 12) * 7 + LETTER[((midi % 12) + 12) % 12]
const TREBLE_BOTTOM = diat(64) // mi4
const BASS_BOTTOM = diat(43) // sol2

const REST_GLYPH: Record<string, string> = { '4': '𝄻', '3': '𝄼', '2': '𝄼', '1.5': '𝄽', '1': '𝄽', '0.75': '𝄾', '0.5': '𝄾', '0.375': '𝄿', '0.25': '𝄿', '0.125': '𝅀' }

export function StaffView({ song, playhead, playing, onMeasure, perLine = 4, scale = 1, showFingers = true, showAnnotations = true }: ViewProps) {
  const len = beatsPerMeasure(song.timeSig)
  const hasL = song.notes.some((n) => n.hand === 'L')
  const measures = Array.from({ length: song.measures }, (_, m) => m)
  const lines = chunk(measures, perLine)
  const pieces = useMemo(() => splitAtBars(song.notes, song.timeSig), [song.notes, song.timeSig])

  const MW = 230 // largeur d'une mesure
  const LEFT = 70
  const trebleTop = 58
  const bassTop = trebleTop + 4 * G + 70
  const sysH = (hasL ? bassTop + 4 * G : trebleTop + 4 * G) + 50
  const width = LEFT + perLine * MW + 10

  return (
    <div className="staff" style={{ fontSize: `${scale}em` }}>
      {lines.map((line, li) => (
        <svg key={li} className="staff-sys" viewBox={`0 0 ${width} ${sysH}`} width="100%" style={{ maxWidth: width * scale * 1.4 }}>
          {/* portées */}
          {[trebleTop, ...(hasL ? [bassTop] : [])].map((top) =>
            [0, 1, 2, 3, 4].map((k) => <line key={`${top}-${k}`} x1={10} x2={LEFT + line.length * MW} y1={top + k * G} y2={top + k * G} className="st-line" />),
          )}
          {/* accolade et clés */}
          <line x1={10} x2={10} y1={trebleTop} y2={hasL ? bassTop + 4 * G : trebleTop + 4 * G} className="st-bar" />
          <text x={14} y={trebleTop + 4 * G + 6} className="st-clef">
            𝄞
          </text>
          {hasL && (
            <text x={16} y={bassTop + 3 * G + 1} className="st-clef bass">
              𝄢
            </text>
          )}
          {li === 0 && (
            <>
              <text x={48} y={trebleTop + 2 * G - 2} className="st-ts">{song.timeSig[0]}</text>
              <text x={48} y={trebleTop + 4 * G - 2} className="st-ts">{song.timeSig[1]}</text>
              {hasL && (
                <>
                  <text x={48} y={bassTop + 2 * G - 2} className="st-ts">{song.timeSig[0]}</text>
                  <text x={48} y={bassTop + 4 * G - 2} className="st-ts">{song.timeSig[1]}</text>
                </>
              )}
            </>
          )}
          <text x={10} y={trebleTop - 30} className="st-mnum">{line[0] + 1}</text>

          {line.map((m, mi) => {
            const x0 = LEFT + mi * MW
            const xOf = (beat: number) => x0 + 14 + ((beat - m * len) / len) * (MW - 28)
            const section = song.sections.find((s) => s.measure === m)
            const chords = song.chords.filter((c) => c.beat >= m * len && c.beat < (m + 1) * len)
            const annots = song.annotations.filter((a) => a.beat >= m * len && a.beat < (m + 1) * len)
            const isNow = playhead != null && playhead >= m * len && playhead < (m + 1) * len
            return (
              <g key={m} onClick={() => onMeasure?.(m)} style={{ cursor: onMeasure ? 'pointer' : undefined }}>
                <rect x={x0} y={trebleTop - 50} width={MW} height={sysH - trebleTop + 20} fill={isNow ? 'var(--accent-wash)' : 'transparent'} />
                <line x1={x0 + MW} x2={x0 + MW} y1={trebleTop} y2={hasL ? bassTop + 4 * G : trebleTop + 4 * G} className="st-bar" />
                {m === song.measures - 1 && <line x1={x0 + MW - 4} x2={x0 + MW - 4} y1={trebleTop} y2={hasL ? bassTop + 4 * G : trebleTop + 4 * G} className="st-bar" />}
                {section && <text x={x0 + 4} y={trebleTop - 42} className="st-section">{section.name}</text>}
                {chords.map((c) => (
                  <text key={c.id} x={xOf(c.beat)} y={trebleTop - 24} className="st-chord">{c.name}</text>
                ))}
                {showAnnotations && annots.map((a) => (
                  <text key={a.id} x={xOf(a.beat)} y={sysH - 10} className="st-annot">{a.text}</text>
                ))}
                {(['R', 'L'] as const)
                  .filter((h) => h === 'R' || hasL)
                  .map((h) => (
                    <StaffHand
                      key={h}
                      pieces={pieces.filter((p) => p.note.hand === h && p.start >= m * len - 1e-6 && p.start < (m + 1) * len - 1e-6)}
                      allPieces={pieces}
                      top={h === 'R' ? trebleTop : bassTop}
                      bottomDiat={h === 'R' ? TREBLE_BOTTOM : BASS_BOTTOM}
                      xOf={xOf}
                      mStart={m * len}
                      len={len}
                      playing={playing}
                      showFingers={showFingers}
                      fingerAbove={h === 'R'}
                    />
                  ))}
                {isNow && <line x1={xOf(playhead!)} x2={xOf(playhead!)} y1={trebleTop - 8} y2={(hasL ? bassTop : trebleTop) + 4 * G + 8} className="st-playhead" />}
              </g>
            )
          })}
        </svg>
      ))}
      <p className="faint ng-legend">Format : partition sur portée · clé de sol = main droite · clé de fa = main gauche · les altérations sont écrites en dièses</p>
    </div>
  )
}

function StaffHand({
  pieces,
  allPieces,
  top,
  bottomDiat,
  xOf,
  mStart,
  len,
  playing,
  showFingers,
  fingerAbove,
}: {
  pieces: Piece[]
  allPieces: Piece[]
  top: number
  bottomDiat: number
  xOf: (b: number) => number
  mStart: number
  len: number
  playing: Set<string>
  showFingers: boolean
  fingerAbove: boolean
}) {
  const bottomY = top + 4 * G
  const yOfMidi = (midi: number) => bottomY - (diat(midi) - bottomDiat) * (G / 2)
  const groups = groupByStart(pieces)
  const rests = restsInMeasure(pieces, mStart, len)
  const accidentals = new Map<number, boolean>() // position diatonique → dièse actif dans la mesure
  const els: ReactElement[] = []

  groups.forEach((g, gi) => {
    // une valeur écrivable par accord : on découpe la plus longue durée commune
    const dur = Math.min(...g.items.map((p) => p.dur))
    const parts = decompose(dur)
    let t = g.start
    parts.forEach((v, pi) => {
      const x = xOf(t)
      const ys = g.items.map((p) => yOfMidi(p.note.pitch))
      const mid = top + 2 * G
      const avg = ys.reduce((a, b) => a + b, 0) / ys.length
      const up = avg > mid
      const base = v >= 4 ? 4 : v >= 2 ? 2 : v >= 1 ? 1 : v >= 0.5 ? 0.5 : v >= 0.25 ? 0.25 : 0.125
      const dotted = Math.abs(v - base * 1.5) < 1e-6
      const filled = base < 2
      const isPlaying = g.items.some((p) => playing.has(p.note.id))
      const cls = `st-note ${isPlaying ? 'playing' : ''} hand`
      g.items.forEach((p, k) => {
        const y = ys[k]
        // lignes supplémentaires
        for (let ly = bottomY + G; ly <= y + 0.1; ly += G) els.push(<line key={`l${gi}${pi}${k}${ly}`} x1={x - 9} x2={x + 9} y1={ly} y2={ly} className="st-line" />)
        for (let ly = top - G; ly >= y - 0.1; ly -= G) els.push(<line key={`u${gi}${pi}${k}${ly}`} x1={x - 9} x2={x + 9} y1={ly} y2={ly} className="st-line" />)
        // altérations
        if (pi === 0 && p.start === p.note.start) {
          const d = diat(p.note.pitch)
          const sharp = isBlack(p.note.pitch)
          if (sharp && !accidentals.get(d)) {
            els.push(<text key={`a${gi}${k}`} x={x - 18} y={y + 4} className="st-acc">♯</text>)
            accidentals.set(d, true)
          } else if (!sharp && accidentals.get(d)) {
            els.push(<text key={`n${gi}${k}`} x={x - 17} y={y + 4} className="st-acc">♮</text>)
            accidentals.set(d, false)
          }
        }
        els.push(
          <ellipse key={`h${gi}${pi}${k}`} cx={x} cy={y} rx={6} ry={4.4} transform={`rotate(-20 ${x} ${y})`} className={`${cls} ${filled ? 'filled' : 'open'}`} />,
        )
        if (dotted) els.push(<circle key={`d${gi}${pi}${k}`} cx={x + 10} cy={y - (Math.round((bottomY - y) / (G / 2)) % 2 === 0 ? G / 2 : 0)} r={1.8} className="st-dot" />)
        // liaison vers la suite de la même note
        const continues = pi < parts.length - 1 || p.tieToNext
        if (continues) {
          const nextX = pi < parts.length - 1 ? xOf(t + v) : (() => {
            const nxt = allPieces.find((q) => q.note.id === p.note.id && Math.abs(q.start - (p.start + p.dur)) < 1e-6)
            return nxt ? xOf(nxt.start) : x + 30
          })()
          const dir = up ? 1 : -1
          els.push(<path key={`t${gi}${pi}${k}`} d={`M ${x + 5} ${y + dir * 5} Q ${(x + nextX) / 2} ${y + dir * 13} ${nextX - 5} ${y + dir * 5}`} className="st-tie" />)
        }
        if (showFingers && p.note.finger && pi === 0 && p.start === p.note.start) {
          els.push(<text key={`f${gi}${k}`} x={x} y={fingerAbove ? top - 4 - k * 11 : bottomY + 16 + k * 11} className="st-finger">{p.note.finger}</text>)
        }
      })
      // hampe et crochets
      if (base < 4) {
        const yTop = Math.min(...ys)
        const yBot = Math.max(...ys)
        const sx = up ? x + 5.6 : x - 5.6
        const y1 = up ? yBot : yTop
        const y2 = up ? yTop - 3.4 * G : yBot + 3.4 * G
        els.push(<line key={`s${gi}${pi}`} x1={sx} x2={sx} y1={y1} y2={y2} className="st-stem" />)
        const flags = base === 0.5 ? 1 : base === 0.25 ? 2 : base === 0.125 ? 3 : 0
        for (let f = 0; f < flags; f++) {
          const fy = y2 + (up ? f * 7 : -f * 7)
          els.push(<path key={`fl${gi}${pi}${f}`} d={up ? `M ${sx} ${fy} q 2 7 9 11 q -3 -6 -9 -6` : `M ${sx} ${fy} q 2 -7 9 -11 q -3 6 -9 6`} className="st-flag" />)
        }
      }
      t += v
    })
  })

  rests.forEach((r, ri) => {
    let t = r.start
    decompose(r.dur).forEach((v, k) => {
      const x = xOf(t) + (v >= 4 && Math.abs(r.dur - len) < 1e-6 ? (xOf(mStart + len) - xOf(mStart)) / 2 - 8 : 0)
      if (v >= 4 || (Math.abs(v - len) < 1e-6 && Math.abs(r.dur - len) < 1e-6)) els.push(<rect key={`r${ri}${k}`} x={x - 6} y={top + G} width={12} height={5} className="st-rest-block" />)
      else if (v >= 2) els.push(<rect key={`r${ri}${k}`} x={x - 6} y={top + 2 * G - 5} width={12} height={5} className="st-rest-block" />)
      else els.push(<text key={`r${ri}${k}`} x={x - 5} y={top + 3 * G} className="st-rest">{REST_GLYPH[String(v)] ?? '𝄽'}</text>)
      t += v
    })
  })
  return <>{els}</>
}

/** Liste plate des groupes, utilisée pour « reprendre » ou pour les exports. */
export const notesAt = (song: Song, beat: number): SongNote[] => song.notes.filter((n) => n.start <= beat + 1e-6 && n.start + n.dur > beat + 1e-6)
