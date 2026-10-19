import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/db'
import { Mascot } from '../../components/Mascot'
import './letter.css'

/** Boîte aux lettres secrète : un bouquet qui ne fane pas et une lettre scellée. */

export const LETTER_KEY = 'letter-1-opened'

const LETTER: string[] = [
  'Je sais que ce ne sont pas des vraies fleurs, qu’on peut pas les sentir ni les garder dans un vase mais au moins elles ne fanerons pas et tu n’auras pas besoin de les faire sécher et les mettre dans le bac a roses séchées.',
  'Je sais que la situation est compliquée, et surtout pour toi. T’as l’impression d’être perdue un peu partout en ce moment, que ce soit personnellement, professionnellement ou même dans notre relation.',
  'Mais y’a un truc que je veux vraiment que tu saches, c’est que moi j’ai toujours cru en toi.',
  'Je trouve que t’es une femme hyper riche, dans ta façon de penser, dans tes idées, dans tes ambitions, dans ta manière de voir la vie. T’as un truc vraiment à part, et c’est aussi pour ça que je t’aime autant. T’es une source d’inspiration pour moi, vraiment. Y’a énormément de choses à apprendre juste en étant à tes côtés, dans ta façon de réfléchir, de rebondir, de continuer malgré toutes les galères que tu as pu vivre et toutes les épreuves que tu as traversé, et même quand tu flanches, je suis toujours admiratif de la façon dont t’arrives à repartir derrière.',
  'Je crois réellement en tes projets je sais que ca va marcher, j’ai envie de les voir évoluer, de voir jusqu’où tu peux aller, et d’y participer aussi si t’en as envie.',
  'Je veux aussi te dire que je suis désolé pour tout ce que j’ai pu abîmer entre nous.',
  'Tu sais que je travaille beaucoup sur moi en ce moment et pareil pour toi, mais je sais aussi que parfois ça ne se voit pas, ou que l’image que t’as de moi est tellement ternie que mes efforts peuvent être complètement effacés derrière tout ce qui s’est passé. Je te demande pas d’oublier ni de me croire juste parce que je te l’écris, je veux te montrer les choses avec le temps, qu’on y croit vraiment a deux et qu’on tente vraiment de lâcher du lest car je suis persuadé qu’on est capables d’aller très loin a deux.',
  'Et surtout je veux que tu saches que même si toi en ce moment tu doutes de toi et que des fois je fais trop le minion pour que tu penses que je suis sérieux, moi je doute pas de la personne que t’es.',
]
const CLOSING = ['Je crois en toi, vraiment.', 'Je t’aime']
const SIGNATURE = 'Ton M'

type Stage = 'deliver' | 'closed' | 'seal' | 'flap' | 'rise' | 'read'

type MinionPhase = 'walk' | 'give' | 'idle' | 'happy'

export function LetterPage() {
  const navigate = useNavigate()
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [stage, setStage] = useState<Stage>(reduced ? 'closed' : 'deliver')
  const [minion, setMinion] = useState<MinionPhase>(reduced ? 'idle' : 'walk')
  const timers = useRef<number[]>([])
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))

  // Minion arrive en marchant, pose le bouquet et la lettre, puis va s'asseoir dans un coin
  const deliver = () => {
    setStage('deliver')
    setMinion('walk')
    later(2600, () => {
      setMinion('give')
      setStage('closed')
    })
    later(5600, () => setMinion('idle'))
  }

  useEffect(() => {
    if (!reduced) deliver()
    return () => timers.current.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const open = () => {
    if (stage !== 'closed') return
    db.kv.put({ id: LETTER_KEY, value: Date.now() })
    setMinion('happy')
    if (reduced) return setStage('read')
    setStage('seal')
    later(750, () => setStage('flap'))
    later(1500, () => setStage('rise'))
    later(2600, () => setStage('read'))
    later(4200, () => setMinion('idle'))
  }

  const replay = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    window.scrollTo({ top: 0 })
    if (reduced) setStage('closed')
    else deliver()
  }

  return (
    <div className={`lt stage-${stage}`}>
      <button className="lt-back" onClick={() => navigate('/messages')} aria-label="Revenir aux messages">
        ←
      </button>
      <Petals />
      <Courier phase={minion} />

      <div className="lt-scene">
        {stage !== 'deliver' && <Bouquet />}

        {stage === 'deliver' ? null : stage !== 'read' ? (
          <div className="lt-envwrap">
            <button className="lt-env" onClick={open} aria-label="Ouvrir la lettre">
              <span className="lt-env-back" />
              <span className="lt-paper lt-paper-peek">
                <span className="lt-peek-line" />
                <span className="lt-peek-line short" />
                <span className="lt-peek-line" />
              </span>
              <span className="lt-env-front" />
              <span className="lt-env-flap" />
              <span className="lt-seal">
                <Seal />
              </span>
            </button>
            <p className="lt-hint">{stage === 'closed' ? 'Une lettre pour toi… clique sur le sceau' : ' '}</p>
          </div>
        ) : (
          <article className="lt-letter">
            <div className="lt-letter-paper">
              {LETTER.map((p, i) => (
                <p key={i} style={{ ['--i' as string]: i }}>
                  {p}
                </p>
              ))}
              <p className="lt-closing" style={{ ['--i' as string]: LETTER.length }}>
                {CLOSING[0]}
                <br />
                {CLOSING[1]}
              </p>
              <p className="lt-sign" style={{ ['--i' as string]: LETTER.length + 1 }}>
                {SIGNATURE}
              </p>
            </div>
            <div className="lt-actions">
              <button className="btn sm" onClick={replay}>
                Revoir depuis le début
              </button>
              <button className="btn sm" onClick={() => navigate('/')}>
                Revenir à Minion
              </button>
            </div>
          </article>
        )}
      </div>
    </div>
  )
}

/* ---------- Minion le facteur ---------- */
function Courier({ phase }: { phase: MinionPhase }) {
  return (
    <div className={`lt-courier ${phase}`} aria-hidden>
      <div className="lt-courier-bob">
        <Mascot size={150} className="lt-courier-body" />
        {(phase === 'walk' || phase === 'give') && (
          <>
            <div className="lt-carry-bouquet">
              <Bouquet still />
            </div>
            <div className="lt-carry-letter">
              <span />
            </div>
          </>
        )}
        {phase === 'happy' && (
          <div className="lt-hearts">
            <span>♥</span>
            <span>♥</span>
            <span>♥</span>
          </div>
        )}
      </div>
      {phase === 'give' && <div className="lt-bubble">Une livraison pour toi !</div>}
    </div>
  )
}

/* ---------- le sceau de cire ---------- */
function Seal() {
  return (
    <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="wax" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#d4545e" />
          <stop offset="0.6" stopColor="#a8323d" />
          <stop offset="1" stopColor="#7d1f2a" />
        </radialGradient>
      </defs>
      <path
        d="M40 4c6 0 8 4 13 5s9 0 12 5 1 9 4 13 7 7 6 13-5 7-6 12 2 10-2 14-9 2-13 5-6 7-12 7-8-4-13-6-10 0-13-4-1-9-4-13-7-7-7-13 5-8 6-13-1-10 3-13 9-1 13-4 6-11 12-11z"
        fill="url(#wax)"
      />
      <circle cx="40" cy="40" r="22" fill="none" stroke="#7d1f2a" strokeOpacity="0.55" strokeWidth="2" />
      <path d="M40 52s-12-7.2-12-16a7 7 0 0 1 12-4.6A7 7 0 0 1 52 36c0 8.8-12 16-12 16z" fill="#7d1f2a" fillOpacity="0.6" />
      <ellipse cx="30" cy="24" rx="8" ry="4" fill="#fff" opacity="0.18" transform="rotate(-30 30 24)" />
    </svg>
  )
}

/* ---------- le bouquet ---------- */
const ROSES = [
  { x: 64, y: 104, r: 24, c: '#c9374a' },
  { x: 176, y: 104, r: 24, c: '#d64a5e' },
  { x: 92, y: 124, r: 26, c: '#e0607a' },
  { x: 148, y: 124, r: 26, c: '#b8283c' },
  { x: 120, y: 112, r: 30, c: '#c9374a' },
  { x: 78, y: 72, r: 25, c: '#e8899b' },
  { x: 162, y: 72, r: 25, c: '#c9374a' },
  { x: 120, y: 74, r: 27, c: '#e0607a' },
  { x: 98, y: 42, r: 23, c: '#b8283c' },
  { x: 142, y: 42, r: 23, c: '#e8899b' },
  { x: 120, y: 20, r: 20, c: '#d64a5e' },
  { x: 48, y: 64, r: 19, c: '#b8283c' },
  { x: 192, y: 64, r: 19, c: '#e0607a' },
]

function Rose({ x, y, r, c, i }: { x: number; y: number; r: number; c: string; i: number }) {
  const dark = shade(c, 0.72)
  const light = shade(c, 1.18)
  return (
    <g className="lt-rose" style={{ ['--i' as string]: i, transformOrigin: `${x}px ${y}px` }}>
      <circle cx={x} cy={y} r={r} fill={c} />
      <path d={`M${x - r * 0.95} ${y + r * 0.1}a${r} ${r * 0.85} 0 0 0 ${r * 1.9} 0`} fill={dark} opacity="0.55" />
      <path d={`M${x - r * 0.6} ${y - r * 0.15}a${r * 0.62} ${r * 0.55} 0 0 1 ${r * 1.2} 0`} fill="none" stroke={dark} strokeWidth={r * 0.1} strokeLinecap="round" />
      <path d={`M${x + r * 0.55} ${y + r * 0.2}a${r * 0.55} ${r * 0.5} 0 0 1 ${-r * 1.0} ${r * 0.1}`} fill="none" stroke={dark} strokeWidth={r * 0.09} strokeLinecap="round" />
      <path d={`M${x - r * 0.25} ${y - r * 0.05}a${r * 0.3} ${r * 0.3} 0 1 1 ${r * 0.45} ${r * 0.2}`} fill="none" stroke={dark} strokeWidth={r * 0.09} strokeLinecap="round" />
      <ellipse cx={x - r * 0.35} cy={y - r * 0.45} rx={r * 0.35} ry={r * 0.16} fill={light} opacity="0.5" transform={`rotate(-20 ${x} ${y})`} />
    </g>
  )
}

function Bouquet({ still = false }: { still?: boolean }) {
  return (
    <div className={`lt-bouquet ${still ? 'still' : ''}`} aria-hidden>
      <svg viewBox="0 -10 240 350" overflow="visible" width="100%" height="100%">
        {/* tiges */}
        <g className="lt-stems" stroke="#5f7d52" strokeWidth="3.2" strokeLinecap="round" fill="none">
          {ROSES.map((r, i) => (
            <path key={i} d={`M${120 + (i - 3.5) * 2.5} 250 Q ${(r.x + 120) / 2} ${(r.y + 250) / 2 + 10} ${r.x} ${r.y + r.r * 0.6}`} />
          ))}
        </g>
        {/* feuillage */}
        <g className="lt-leaves">
          {[
            [56, 128, -40],
            [186, 130, 40],
            [92, 150, -20],
            [152, 150, 25],
            [44, 98, -65],
            [198, 96, 65],
            [120, 140, 0],
          ].map(([x, y, a], i) => (
            <path key={i} d="M0 0c10-8 26-8 34 0-8 8-24 8-34 0z" fill={i % 2 ? '#6f9462' : '#87ab78'} transform={`translate(${x} ${y}) rotate(${a}) translate(-17 0)`} />
          ))}
          {[[78, 52], [168, 46], [60, 120], [184, 124], [138, 30]].map(([x, y], i) => (
            <g key={i} fill="#fbf6ee">
              <circle cx={x} cy={y} r="3.2" />
              <circle cx={x + 6} cy={y + 3} r="2.6" />
              <circle cx={x - 4} cy={y + 5} r="2.4" />
            </g>
          ))}
        </g>
        {ROSES.map((r, i) => (
          <Rose key={i} {...r} i={i} />
        ))}
        {/* papier kraft */}
        <g className="lt-wrap">
          <path d="M40 150 L120 330 L200 150 L176 160 L120 300 L64 160 Z" fill="#e6d3b5" />
          <path d="M30 140 L120 332 L96 160 Z" fill="#efe0c6" />
          <path d="M210 140 L120 332 L144 160 Z" fill="#dcc5a2" />
          <path d="M96 160 L120 332 L144 160 Q120 172 96 160z" fill="#e9d8bb" />
          {/* ruban */}
          <path d="M100 238 Q120 246 140 238 L137 252 Q120 258 103 252Z" fill="#c98b8b" />
          <path d="M118 245 C100 230 86 236 92 248 C98 258 112 252 118 245z" fill="#d9a0a0" />
          <path d="M122 245 C140 230 154 236 148 248 C142 258 128 252 122 245z" fill="#d9a0a0" />
          <path d="M116 248 L104 286 L112 282 L118 290 Z" fill="#c98b8b" />
          <path d="M124 248 L136 286 L128 282 L122 290 Z" fill="#b97a7a" />
          <circle cx="120" cy="246" r="5" fill="#b97a7a" />
        </g>
      </svg>
    </div>
  )
}

function Petals() {
  return (
    <div className="lt-petals" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} style={{ left: `${(i * 83) % 100}%`, animationDelay: `${(i * 1.7) % 11}s`, animationDuration: `${11 + (i % 5) * 2}s`, ['--drift' as string]: `${(i % 2 ? 1 : -1) * (30 + (i % 4) * 25)}px`, ['--s' as string]: 0.6 + (i % 3) * 0.25 }} />
      ))}
    </div>
  )
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`
}
