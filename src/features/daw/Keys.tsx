import { useEffect, useRef, useState } from 'react'
import { noteName } from '../synth/music'

/** Touches de l'ordinateur → demi-tons (positions physiques, valables en AZERTY comme en QWERTY). */
export const KEYMAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
}

/** Libellés réels des touches (si le navigateur sait lire la disposition du clavier). */
export function useKeyLabels() {
  const [labels, setLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard
    kb?.getLayoutMap()
      .then((m) => {
        const out: Record<string, string> = {}
        for (const code of [...Object.keys(KEYMAP), 'KeyZ', 'KeyX', 'KeyC', 'KeyV']) out[code] = (m.get(code) ?? '').toUpperCase()
        setLabels(out)
      })
      .catch(() => {})
  }, [])
  const fallback: Record<string, string> = { KeyA: 'Q', KeyW: 'Z', KeyZ: 'W', Semicolon: 'M', Quote: 'Ù' }
  return (code: string) => labels[code] || fallback[code] || code.replace('Key', '')
}

interface Props {
  octave: number
  setOctave: (o: number) => void
  velocity: number
  setVelocity: (v: number) => void
  kbd: boolean
  setKbd: (b: boolean) => void
  held: Set<number>
  onDown: (p: number) => void
  onUp: (p: number) => void
  midi: string | null
  onMidi: () => void
  trackName: string | null
}

export function Keys({ octave, setOctave, velocity, setVelocity, kbd, setKbd, held, onDown, onUp, midi, onMidi, trackName }: Props) {
  const label = useKeyLabels()
  const first = (octave + 1) * 12 - 12 // une octave sous l'octave du clavier ordinateur
  const keys: number[] = []
  for (let p = first; p < first + 36; p++) keys.push(p)
  const whites = keys.filter((p) => ![1, 3, 6, 8, 10].includes(p % 12))
  const kbdBase = (octave + 1) * 12
  const codeFor = (p: number) => Object.entries(KEYMAP).find(([, v]) => kbdBase + v === p)?.[0]
  const down = useRef(false)

  return (
    <div className="keys">
      <div className="keys-bar">
        <span>
          Joue sur : <b>{trackName ?? 'choisis une piste d’instrument'}</b>
        </span>
        <button className={`dw-btn ${kbd ? 'accent' : ''}`} onClick={() => setKbd(!kbd)} title="Les lettres du clavier jouent des notes">
          ⌨ Clavier de l’ordinateur {kbd ? 'activé' : 'désactivé'}
        </button>
        <label className="dw-field">
          Octave
          <button className="dw-btn sm" onClick={() => setOctave(Math.max(0, octave - 1))}>
            −
          </button>
          <b>{octave - 1}</b>
          <button className="dw-btn sm" onClick={() => setOctave(Math.min(8, octave + 1))}>
            +
          </button>
        </label>
        <label className="dw-field">
          Force
          <input type="range" min={0.1} max={1} step={0.01} value={velocity} onChange={(e) => setVelocity(+e.target.value)} />
          <b>{Math.round(velocity * 127)}</b>
        </label>
        <button className="dw-btn" onClick={onMidi} title="Utiliser un clavier MIDI branché en USB">
          🎹 {midi ?? 'Brancher un clavier MIDI'}
        </button>
      </div>
      <div className="keys-piano" onPointerUp={() => (down.current = false)} onPointerLeave={() => (down.current = false)}>
        {whites.map((p, i) => {
          const code = codeFor(p)
          return (
            <div
              key={p}
              className={`dkw ${held.has(p) ? 'on' : ''}`}
              style={{ left: `${(i / whites.length) * 100}%`, width: `${100 / whites.length}%` }}
              onPointerDown={(e) => {
                ;(e.target as Element).releasePointerCapture?.(e.pointerId)
                down.current = true
                onDown(p)
              }}
              onPointerUp={() => onUp(p)}
              onPointerEnter={() => down.current && onDown(p)}
              onPointerLeave={() => held.has(p) && onUp(p)}
            >
              {kbd && code && <kbd>{label(code)}</kbd>}
              {p % 12 === 0 && <span>{noteName(p)}</span>}
            </div>
          )
        })}
        {keys
          .filter((p) => [1, 3, 6, 8, 10].includes(p % 12))
          .map((p) => {
            const wi = whites.filter((w) => w < p).length
            const code = codeFor(p)
            return (
              <div
                key={p}
                className={`dkb ${held.has(p) ? 'on' : ''}`}
                style={{ left: `calc(${(wi / whites.length) * 100}% - ${100 / whites.length / 3}%)`, width: `${(100 / whites.length) * 0.62}%` }}
                onPointerDown={(e) => {
                  ;(e.target as Element).releasePointerCapture?.(e.pointerId)
                  down.current = true
                  onDown(p)
                }}
                onPointerUp={() => onUp(p)}
                onPointerEnter={() => down.current && onDown(p)}
                onPointerLeave={() => held.has(p) && onUp(p)}
              >
                {kbd && code && <kbd>{label(code)}</kbd>}
              </div>
            )
          })}
      </div>
      <p className="dw-hint">
        {kbd ? (
          <>
            Rangée du milieu = touches blanches, rangée du haut = touches noires · <kbd>{label('KeyZ')}</kbd> / <kbd>{label('KeyX')}</kbd> octave · <kbd>{label('KeyC')}</kbd> / <kbd>{label('KeyV')}</kbd> force ·
            Espace lecture
          </>
        ) : (
          'Active le clavier de l’ordinateur pour jouer avec les lettres, ou clique sur les touches.'
        )}
      </p>
    </div>
  )
}
