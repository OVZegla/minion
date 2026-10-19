import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Mascot } from '../../components/Mascot'

export interface TourStep {
  target?: string
  title: string
  text: ReactNode
  before?: () => void
}

type Box = { x: number; y: number; w: number; h: number }

/** Visite guidée : Minion met en lumière une zone de l'écran et l'explique. */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const bubble = useRef<HTMLDivElement>(null)
  const [bh, setBh] = useState(220)
  const step = steps[i]
  const last = i === steps.length - 1

  useEffect(() => {
    step.before?.()
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  // suit la zone visée (elle peut bouger, s'ouvrir, défiler…)
  useEffect(() => {
    let raf = 0
    let prev = '#'
    const tick = () => {
      const el = step.target ? document.querySelector(step.target) : null
      const r = el?.getBoundingClientRect()
      // limitée à la partie visible de l'écran
      const x = r ? Math.max(0, r.left) : 0
      const y = r ? Math.max(0, r.top) : 0
      const w = r ? Math.min(window.innerWidth, r.right) - x : 0
      const h = r ? Math.min(window.innerHeight, r.bottom) - y : 0
      const key = r && w > 0 && h > 0 ? `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}` : ''
      if (key !== prev) {
        prev = key
        setBox(key ? { x, y, w, h } : null)
      }
      if (window.innerWidth !== size.w || window.innerHeight !== size.h) setSize({ w: window.innerWidth, h: window.innerHeight })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [i, step.target, size.w, size.h])

  useLayoutEffect(() => {
    if (bubble.current) setBh(bubble.current.offsetHeight)
  }, [i, box])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.stopPropagation()
        setI((x) => Math.min(steps.length - 1, x + 1))
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation()
        setI((x) => Math.max(0, x - 1))
      } else if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [steps.length, onClose])

  // place la bulle sous la zone, au-dessus, ou au milieu de l'écran
  const W = Math.min(390, size.w - 24)
  const pad = 8
  let pos: { left: number; top: number }
  if (!box) pos = { left: (size.w - W) / 2, top: Math.max(16, (size.h - bh) / 2) }
  else {
    const left = Math.max(12, Math.min(size.w - W - 12, box.x + box.w / 2 - W / 2))
    if (box.y + box.h + pad + bh + 16 < size.h) pos = { left, top: box.y + box.h + pad + 12 }
    else if (box.y - pad - bh - 16 > 0) pos = { left, top: box.y - pad - bh - 12 }
    else pos = { left, top: Math.max(12, size.h - bh - 16) }
  }

  return (
    <div className="tour" role="dialog" aria-label={step.title}>
      <div className={`tour-hole ${box ? '' : 'none'}`} style={box ? { left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 } : undefined} />
      <div className="tour-bubble" ref={bubble} style={{ left: pos.left, top: pos.top, width: W }} key={i}>
        <div className="tour-head">
          <Mascot size={52} className="tour-mascot" />
          <div>
            <div className="tour-count">
              {i + 1} / {steps.length}
            </div>
            <b className="tour-title">{step.title}</b>
          </div>
        </div>
        <div className="tour-text">{step.text}</div>
        <div className="tour-dots" aria-hidden>
          {steps.map((_, k) => (
            <i key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          {!last && (
            <button className="tour-skip" onClick={onClose}>
              Passer la visite
            </button>
          )}
          <span className="dw-spacer" />
          {i > 0 && (
            <button className="dw-btn" onClick={() => setI(i - 1)}>
              ← Retour
            </button>
          )}
          <button className="dw-btn accent" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'À moi de jouer !' : 'Suivant →'}
          </button>
        </div>
      </div>
    </div>
  )
}
