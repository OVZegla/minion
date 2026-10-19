import { createContext, useContext, useEffect, useRef, type CSSProperties, type RefObject } from 'react'

/* ---------------- Tête de lecture partagée (mise à jour hors React) ---------------- */

type Sub = (beat: number) => void
export const PlayheadCtx = createContext<{ subscribe(fn: Sub): () => void }>({ subscribe: () => () => {} })

/** Place un élément à la position de lecture, sans re-rendu React. */
export function usePlayhead(ref: RefObject<HTMLElement | null>, ppb: number, offset = 0) {
  const { subscribe } = useContext(PlayheadCtx)
  useEffect(
    () =>
      subscribe((beat) => {
        if (ref.current) ref.current.style.transform = `translateX(${offset + Math.max(0, beat) * ppb}px)`
      }),
    [subscribe, ppb, offset, ref],
  )
}

/* ---------------- Bouton rotatif ---------------- */

interface KnobProps {
  value: number
  min: number
  max: number
  def?: number
  log?: boolean
  step?: number
  label?: string
  size?: number
  format?: (v: number) => string
  onChange: (v: number) => void
  bipolar?: boolean
  color?: string
}

const toNorm = (v: number, min: number, max: number, log?: boolean) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min))
const fromNorm = (n: number, min: number, max: number, log?: boolean) => (log ? min * Math.pow(max / min, n) : min + n * (max - min))

export function Knob({ value, min, max, def, log, step, label, size = 38, format, onChange, bipolar, color }: KnobProps) {
  const drag = useRef<{ y: number; n: number } | null>(null)
  const n = Math.max(0, Math.min(1, toNorm(value, min, max, log)))
  const A0 = -135
  const ang = A0 + n * 270
  const r = size / 2 - 4
  const c = size / 2
  const arc = (a1: number, a2: number) => {
    const p = (a: number) => [c + r * Math.sin((a * Math.PI) / 180), c - r * Math.cos((a * Math.PI) / 180)]
    const [x1, y1] = p(a1)
    const [x2, y2] = p(a2)
    const large = Math.abs(a2 - a1) > 180 ? 1 : 0
    const sweep = a2 > a1 ? 1 : 0
    return `M${x1} ${y1}A${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`
  }
  const startA = bipolar ? 0 : A0
  const set = (nn: number) => {
    let v = fromNorm(Math.max(0, Math.min(1, nn)), min, max, log)
    if (step) v = Math.round(v / step) * step
    onChange(Math.max(min, Math.min(max, v)))
  }
  return (
    <div className="knob" title={label ? `${label} : ${format ? format(value) : value}` : undefined}>
      <svg
        width={size}
        height={size}
        onPointerDown={(e) => {
          e.preventDefault()
          ;(e.target as Element).setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, n }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const k = e.shiftKey ? 0.0015 : 0.006
          set(drag.current.n + (drag.current.y - e.clientY) * k)
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => def !== undefined && onChange(def)}
        onWheel={(e) => set(n - Math.sign(e.deltaY) * 0.03)}
      >
        <path d={arc(A0, 135)} className="knob-track" />
        {Math.abs(ang - startA) > 0.5 && <path d={arc(Math.min(startA, ang), Math.max(startA, ang))} className="knob-val" style={color ? { stroke: color } : undefined} />}
        <circle cx={c} cy={c} r={r - 5} className="knob-cap" />
        <line x1={c} y1={c} x2={c + (r - 6) * Math.sin((ang * Math.PI) / 180)} y2={c - (r - 6) * Math.cos((ang * Math.PI) / 180)} className="knob-needle" />
      </svg>
      {label && <span className="knob-label">{label}</span>}
      <span className="knob-value">{format ? format(value) : Math.round(value * 100) / 100}</span>
    </div>
  )
}

/* ---------------- Fader vertical ---------------- */

/** Courbe de fader : -60 dB à +6 dB, plus fine autour de 0. */
const FADER_MIN = -60
const FADER_MAX = 6
const dbToPos = (db: number) => Math.pow((Math.max(FADER_MIN, db) - FADER_MIN) / (FADER_MAX - FADER_MIN), 2.2)
const posToDb = (p: number) => FADER_MIN + Math.pow(Math.max(0, Math.min(1, p)), 1 / 2.2) * (FADER_MAX - FADER_MIN)
export const fmtDb = (db: number) => (db <= -59.5 ? '−∞' : `${db > 0 ? '+' : ''}${db.toFixed(1)}`)

export function Fader({ value, onChange, height = 150 }: { value: number; onChange: (db: number) => void; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; p: number } | null>(null)
  const pos = dbToPos(value)
  return (
    <div
      className="fader"
      ref={ref}
      style={{ height }}
      onPointerDown={(e) => {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        const rect = ref.current!.getBoundingClientRect()
        const onThumb = (e.target as HTMLElement).classList.contains('fader-thumb')
        const p = onThumb ? pos : 1 - (e.clientY - rect.top) / rect.height
        if (!onThumb) onChange(Math.round(posToDb(p) * 10) / 10)
        drag.current = { y: e.clientY, p }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const k = e.shiftKey ? 0.25 : 1
        const p = drag.current.p + ((drag.current.y - e.clientY) / height) * k
        onChange(Math.round(posToDb(p) * 10) / 10)
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => onChange(0)}
      title="Double-clic : 0 dB · Maj : réglage fin"
    >
      <div className="fader-rail" />
      <div className="fader-zero" style={{ bottom: `${dbToPos(0) * 100}%` }} />
      <div className="fader-thumb" style={{ bottom: `calc(${pos * 100}% - 9px)` }} />
    </div>
  )
}

/* ---------------- Vumètre ---------------- */

/** Vumètre mis à jour par le moteur via l'attribut data-meter (variable CSS --lvl). */
export function Meter({ id, vertical, style }: { id: string; vertical?: boolean; style?: CSSProperties }) {
  return (
    <div className={`meter ${vertical ? 'v' : 'h'}`} style={style}>
      <div className="meter-fill" data-meter={id} />
    </div>
  )
}

/** Niveau de crête (0–1+) vers une échelle visuelle en dB (-48 à +3). */
export const meterLevel = (peak: number) => {
  if (peak <= 0.00001) return 0
  const db = 20 * Math.log10(peak)
  return Math.max(0, Math.min(1, (db + 48) / 51))
}
