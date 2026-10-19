import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db/db'
import { Mascot } from '../../components/Mascot'
import './birthday.css'

/** Vu une fois : la surprise ne se rejoue pas toute seule ensuite. */
export const BIRTHDAY_KEY = 'birthday-studio-seen'

type Phase = 'arrive' | 'wish' | 'cake' | 'blown' | 'gift' | 'open'

const COLORS = ['#e8b60f', '#c98b8b', '#8fa58a', '#7f9db5', '#a397c4', '#f0a35e', '#e07a5f']

/** « Joyeux anniversaire », joué à la boîte à musique (mélodie traditionnelle). */
function playTune() {
  try {
    const ctx = new AudioContext()
    const N = { G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79 }
    const tune: [keyof typeof N, number][] = [
      ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
      ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
      ['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2],
      ['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3],
    ]
    const beat = 0.5
    const out = ctx.createGain()
    out.gain.value = 0.22
    out.connect(ctx.destination)
    let t = ctx.currentTime + 0.1
    for (const [n, d] of tune) {
      const f = 440 * Math.pow(2, (N[n] - 69) / 12)
      for (const [mult, amp] of [[1, 1], [2.003, 0.35], [4.01, 0.08]]) {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.frequency.value = f * mult
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(amp, t + 0.006)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
        o.connect(g).connect(out)
        o.start(t)
        o.stop(t + 1.5)
      }
      t += d * beat
    }
    setTimeout(() => void ctx.close(), (t - ctx.currentTime + 2) * 1000)
  } catch {
    /* sans son, tant pis */
  }
}

function Confetti({ seed, count = 90 }: { seed: number; count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 2.6 + Math.random() * 2.4,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * 360,
        drift: (Math.random() - 0.5) * 180,
        w: 6 + Math.random() * 7,
        round: Math.random() < 0.3,
      })),
    [seed, count], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <div className="bd-confetti" key={seed} aria-hidden>
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: `${b.left}%`,
            background: b.color,
            width: b.w,
            height: b.round ? b.w : b.w * 0.45,
            borderRadius: b.round ? '50%' : 2,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            ['--rot' as string]: `${b.rot}deg`,
            ['--drift' as string]: `${b.drift}px`,
          }}
        />
      ))}
    </div>
  )
}

function Cake({ lit, onBlow }: { lit: boolean; onBlow: () => void }) {
  return (
    <button className={`bd-cake ${lit ? 'lit' : 'out'}`} onClick={onBlow} aria-label="Souffler les bougies">
      <svg viewBox="0 0 220 230" width="100%" height="100%">
        {/* bougies */}
        {[70, 110, 150].map((x, i) => (
          <g key={x} className="bd-candle" style={{ ['--i' as string]: i }}>
            <rect x={x - 5} y={42} width={10} height={44} rx={3} fill={['#c98b8b', '#a397c4', '#8fa58a'][i]} />
            <path d={`M${x - 5} 52l10 -6M${x - 5} 64l10 -6M${x - 5} 76l10 -6`} stroke="#fff" strokeWidth={2.5} opacity={0.7} />
            <line x1={x} y1={42} x2={x} y2={35} stroke="#4a3d35" strokeWidth={2} />
            <g className="bd-flame">
              <ellipse cx={x} cy={26} rx={7} ry={12} fill="#f6b73c" />
              <ellipse cx={x} cy={29} rx={3.5} ry={6.5} fill="#fff4c2" />
            </g>
            <g className="bd-smoke">
              <circle cx={x} cy={24} r={5} />
              <circle cx={x + 4} cy={14} r={6} />
              <circle cx={x - 2} cy={2} r={7} />
            </g>
          </g>
        ))}
        {/* étage du haut */}
        <rect x={45} y={86} width={130} height={46} rx={10} fill="#fdf2e6" />
        <path d="M45 98c10 12 18 12 26 0s18 12 26 0 18 12 26 0 18 12 26 0 18 12 26 0V92a6 6 0 0 0-6-6H51a6 6 0 0 0-6 6z" fill="#f3c6c6" />
        {/* étage du bas */}
        <rect x={22} y={130} width={176} height={70} rx={12} fill="#f8e6d2" />
        <path d="M22 144c12 14 22 14 30 0s22 14 30 0 22 14 30 0 22 14 30 0 22 14 30 0 18 14 26 0v-8a6 6 0 0 0-6-6H28a6 6 0 0 0-6 6z" fill="#e8b60f" opacity={0.85} />
        {[48, 84, 120, 156].map((x) => (
          <circle key={x} cx={x} cy={172} r={4.5} fill="#c98b8b" />
        ))}
        <ellipse cx={110} cy={206} rx={104} ry={13} fill="#e9dccb" />
      </svg>
    </button>
  )
}

function Gift({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  return (
    <button className={`bd-gift ${open ? 'open' : ''}`} onClick={onOpen} aria-label="Ouvrir le cadeau">
      <span className="bd-gift-notes" aria-hidden>
        {['♪', '♫', '♩', '♬', '♪', '♫'].map((n, i) => (
          <i key={i} style={{ ['--i' as string]: i }}>
            {n}
          </i>
        ))}
      </span>
      <span className="bd-gift-box" />
      <span className="bd-gift-lid">
        <span className="bd-gift-bow" />
      </span>
      <span className="bd-gift-tag">pour toi</span>
    </button>
  )
}

export function Birthday({ name, onDone }: { name: string; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('arrive')
  const [burst, setBurst] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const a = setTimeout(() => {
      setPhase('wish')
      setBurst((b) => b + 1)
    }, 1700)
    const b = setTimeout(() => setPhase((p) => (p === 'wish' ? 'cake' : p)), 4600)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [])

  const blow = () => {
    if (phase !== 'cake' && phase !== 'wish') return
    setPhase('blown')
    setBurst((b) => b + 1)
    playTune()
    setTimeout(() => setPhase('gift'), 3200)
  }
  const openGift = () => {
    if (phase !== 'gift') return
    setPhase('open')
    setBurst((b) => b + 1)
  }
  const close = (toStudio: boolean) => {
    void db.kv.put({ id: BIRTHDAY_KEY, value: Date.now() })
    setLeaving(true)
    setTimeout(() => {
      if (toStudio) location.hash = '#/musique?visite=1'
      onDone()
    }, 650)
  }

  const bubble: Record<Phase, string> = {
    arrive: '',
    wish: `Joyeux anniversaire, ${name} ! 🎉`,
    cake: 'Fais un vœu… puis souffle les bougies ! Clique sur le gâteau.',
    blown: 'Bravo ! Que ton vœu se réalise ✨',
    gift: 'Et maintenant… j’ai un cadeau pour toi. Ouvre-le !',
    open: 'Ton propre studio de musique ! Pour chanter, composer et créer tout ce que tu veux. Viens, je te fais visiter 🎶',
  }
  const showCake = phase === 'cake' || phase === 'wish' || phase === 'blown'
  const title = 'Joyeux anniversaire'

  return (
    <div className={`bd ${phase} ${leaving ? 'leaving' : ''}`} role="dialog" aria-label={`Joyeux anniversaire ${name}`}>
      <div className="bd-glow g1" />
      <div className="bd-glow g2" />
      <div className="bd-balloons" aria-hidden>
        {COLORS.slice(0, 6).map((c, i) => (
          <span key={c} className="bd-balloon" style={{ ['--c' as string]: c, ['--i' as string]: i }} />
        ))}
      </div>
      {burst > 0 && <Confetti seed={burst} count={phase === 'open' ? 120 : 90} />}

      <button className="bd-skip" onClick={() => close(false)}>
        Passer
      </button>

      <header className="bd-title" aria-hidden={phase === 'arrive'}>
        <h1>
          {[...title].map((ch, i) => (
            <span key={i} style={{ ['--i' as string]: i }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </h1>
        <div className="bd-name">{name}</div>
      </header>

      <div className="bd-stage">
        <div className="bd-minion">
          {bubble[phase] && (
            <div className="bd-bubble" key={phase}>
              {bubble[phase]}
            </div>
          )}
          <div className="bd-minion-bob">
            <Mascot size={150} />
            <span className="bd-hat" aria-hidden>
              <svg viewBox="0 0 60 80" width="100%" height="100%">
                <path d="M30 4 6 74h48z" fill="#c98b8b" />
                <path d="M30 4 18 40h24zM12 58h36l3 8H9z" fill="#e8b60f" opacity={0.9} />
                <circle cx={30} cy={5} r={6} fill="#a397c4" />
              </svg>
            </span>
          </div>
        </div>

        <div className="bd-prop">
          {showCake && <Cake lit={phase !== 'blown'} onBlow={blow} />}
          {(phase === 'gift' || phase === 'open') && <Gift open={phase === 'open'} onOpen={openGift} />}
          {phase === 'cake' && <p className="bd-hint">Clique sur le gâteau 🎂</p>}
          {phase === 'gift' && <p className="bd-hint">Clique sur le cadeau</p>}
          {phase === 'open' && (
            <button className="btn primary bd-go" onClick={() => close(true)}>
              Découvrir mon studio →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
