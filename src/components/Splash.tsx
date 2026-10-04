import { useEffect, useMemo, useState } from 'react'
import { greeting, randomPhrase } from '../lib/phrases'
import { Mascot } from './Mascot'
import './splash.css'

interface Props {
  name: string
  extraPhrases?: string[]
  onDone: () => void
}

/** Animation d'ouverture : « Bonjour / Bonsoir Einat » + une phrase douce au hasard. */
export function Splash({ name, extraPhrases = [], onDone }: Props) {
  const hello = useMemo(() => greeting(), [])
  const phrase = useMemo(() => randomPhrase(extraPhrases), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [leaving, setLeaving] = useState(false)
  const evening = hello === 'Bonsoir'

  const leave = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onDone, 900)
  }

  useEffect(() => {
    // Durée de lecture proportionnelle à la phrase
    const t = window.setTimeout(leave, 4200 + Math.min(phrase.length * 28, 2600))
    const onKey = () => leave()
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const letters = [...hello]
  const nameLetters = [...name]

  return (
    <div
      className={`splash ${evening ? 'evening' : 'day'} ${leaving ? 'leaving' : ''}`}
      onClick={leave}
      role="dialog"
      aria-label={`${hello} ${name}`}
    >
      <div className="splash-glow g1" />
      <div className="splash-glow g2" />
      <div className="splash-glow g3" />

      <Sparkles evening={evening} />

      <div className="splash-content">
        <div className="splash-emblem" aria-hidden>
          <Mascot size={92} className="splash-mascot" />
          <span className="splash-sky">{evening ? <MoonEmblem /> : <SunEmblem />}</span>
        </div>

        <h1 className="splash-title">
          <span className="splash-hello">
            {letters.map((c, i) => (
              <span key={i} className="splash-letter" style={{ animationDelay: `${300 + i * 70}ms` }}>
                {c}
              </span>
            ))}
          </span>{' '}
          <span className="splash-name">
            {nameLetters.map((c, i) => (
              <span
                key={i}
                className="splash-letter"
                style={{ animationDelay: `${300 + (letters.length + 1 + i) * 70}ms` }}
              >
                {c}
              </span>
            ))}
            <svg className="splash-underline" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden>
              <path d="M4 18 C 60 6, 120 26, 180 14 S 270 8, 296 16" />
            </svg>
          </span>
        </h1>

        <p className="splash-phrase">{phrase}</p>
      </div>

      <div className="splash-hint">toucher pour entrer</div>
    </div>
  )
}

function SunEmblem() {
  return (
    <svg viewBox="0 0 80 80" width="44" height="44">
      <circle className="draw" cx="40" cy="40" r="13" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4
        const x1 = 40 + Math.cos(a) * 21
        const y1 = 40 + Math.sin(a) * 21
        const x2 = 40 + Math.cos(a) * 29
        const y2 = 40 + Math.sin(a) * 29
        return <line key={i} className="draw ray" x1={x1} y1={y1} x2={x2} y2={y2} style={{ animationDelay: `${0.5 + i * 0.06}s` }} />
      })}
    </svg>
  )
}

function MoonEmblem() {
  return (
    <svg viewBox="0 0 80 80" width="44" height="44">
      <path className="draw" d="M50 18 A 24 24 0 1 0 62 52 A 19 19 0 1 1 50 18 Z" />
      <path className="draw star" d="M60 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" />
    </svg>
  )
}

function Sparkles({ evening }: { evening: boolean }) {
  const dots = useMemo(
    () =>
      Array.from({ length: evening ? 26 : 16 }).map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 2 + Math.random() * (evening ? 3 : 5),
        delay: Math.random() * 2.5,
        dur: 5 + Math.random() * 6,
      })),
    [evening],
  )
  return (
    <div className="splash-sparkles" aria-hidden>
      {dots.map((d, i) => (
        <span
          key={i}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.dur}s`,
          }}
        />
      ))}
    </div>
  )
}
