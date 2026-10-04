/** Tracés vectoriels (courbes de Bézier cubiques) — partagés par l'atelier plume et le studio. */

export interface Pt {
  x: number
  y: number
}

export interface Anchor extends Pt {
  hIn: Pt | null // poignée entrante (coordonnées absolues)
  hOut: Pt | null // poignée sortante
}

export interface VPath {
  anchors: Anchor[]
  closed: boolean
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const mirror = (h: Pt, around: Pt): Pt => ({ x: 2 * around.x - h.x, y: 2 * around.y - h.y })

/** Contraint un point à des angles de 45° autour d'une origine (touche Maj). */
export function constrain45(origin: Pt, p: Pt): Pt {
  const d = dist(origin, p)
  const a = Math.round(Math.atan2(p.y - origin.y, p.x - origin.x) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: origin.x + Math.cos(a) * d, y: origin.y + Math.sin(a) * d }
}

/** Segments du tracé : [p0, c1, c2, p3]. */
export function segments(p: VPath): [Pt, Pt, Pt, Pt][] {
  const out: [Pt, Pt, Pt, Pt][] = []
  const n = p.anchors.length
  const count = p.closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const a = p.anchors[i]
    const b = p.anchors[(i + 1) % n]
    out.push([a, a.hOut ?? a, b.hIn ?? b, b])
  }
  return out
}

export function cubic(s: [Pt, Pt, Pt, Pt], t: number): Pt {
  const [p0, p1, p2, p3] = s
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/** Découpe un segment en t (de Casteljau) — pour ajouter un point d'ancrage. */
export function splitSegment(s: [Pt, Pt, Pt, Pt], t: number) {
  const [p0, p1, p2, p3] = s
  const a = lerp(p0, p1, t)
  const b = lerp(p1, p2, t)
  const c = lerp(p2, p3, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const m = lerp(d, e, t)
  return { left: [p0, a, d, m] as [Pt, Pt, Pt, Pt], right: [m, e, c, p3] as [Pt, Pt, Pt, Pt] }
}

/** Chemin SVG. */
export function toSvg(p: VPath): string {
  if (!p.anchors.length) return ''
  const a0 = p.anchors[0]
  let d = `M ${a0.x} ${a0.y}`
  for (const [, c1, c2, e] of segments(p)) d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${e.x} ${e.y}`
  if (p.closed) d += ' Z'
  return d
}

/** Échantillonne le tracé (points répartis à peu près régulièrement). */
export function sample(p: VPath, perSegment = 40): Pt[] {
  const out: Pt[] = []
  segments(p).forEach((s, i) => {
    for (let k = i === 0 ? 0 : 1; k <= perSegment; k++) out.push(cubic(s, k / perSegment))
  })
  if (p.anchors.length === 1) out.push(p.anchors[0])
  return out
}

export function length(p: VPath) {
  const s = sample(p, 30)
  let l = 0
  for (let i = 1; i < s.length; i++) l += dist(s[i - 1], s[i])
  return l
}

/** Point le plus proche sur le tracé : segment, paramètre t et distance. */
export function nearestOnPath(p: VPath, q: Pt) {
  let best = { seg: -1, t: 0, d: Infinity, pt: q }
  segments(p).forEach((s, i) => {
    for (let k = 0; k <= 60; k++) {
      const t = k / 60
      const pt = cubic(s, t)
      const d = dist(pt, q)
      if (d < best.d) best = { seg: i, t, d, pt }
    }
  })
  // affinage local
  if (best.seg >= 0) {
    const s = segments(p)[best.seg]
    let step = 1 / 120
    for (let it = 0; it < 12; it++) {
      for (const t of [best.t - step, best.t + step]) {
        if (t < 0 || t > 1) continue
        const pt = cubic(s, t)
        const d = dist(pt, q)
        if (d < best.d) best = { ...best, t, d, pt }
      }
      step /= 2
    }
  }
  return best
}

/** Ajoute un point d'ancrage sur un segment en conservant la forme. */
export function insertAnchor(p: VPath, seg: number, t: number): VPath {
  const s = segments(p)[seg]
  const { left, right } = splitSegment(s, t)
  const n = p.anchors.length
  const anchors = p.anchors.map((a) => ({ ...a }))
  const i0 = seg
  const i1 = (seg + 1) % n
  const a0 = anchors[i0]
  const a1 = anchors[i1]
  const hadOut = !!a0.hOut
  const hadIn = !!a1.hIn
  a0.hOut = hadOut || hadIn ? left[1] : null
  a1.hIn = hadOut || hadIn ? right[2] : null
  const curved = hadOut || hadIn
  const mid: Anchor = { x: left[3].x, y: left[3].y, hIn: curved ? left[2] : null, hOut: curved ? right[1] : null }
  anchors.splice(seg + 1, 0, mid)
  return { ...p, anchors }
}

/** Distance moyenne symétrique entre deux tracés (plus c'est petit, plus ils se ressemblent). */
export function pathDistance(a: VPath, b: VPath) {
  const sa = resample(sample(a, 40), 160)
  const sb = resample(sample(b, 40), 160)
  if (!sa.length || !sb.length) return Infinity
  const md = (from: Pt[], to: Pt[]) => from.reduce((s, p) => s + Math.min(...to.map((q) => dist(p, q))), 0) / from.length
  return (md(sa, sb) + md(sb, sa)) / 2
}

/** Ré-échantillonne une polyligne en n points espacés régulièrement. */
export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length < 2) return pts
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]))
  const total = cum[cum.length - 1]
  if (total === 0) return [pts[0]]
  const out: Pt[] = []
  let j = 1
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total
    while (j < cum.length - 1 && cum[j] < target) j++
    const seg = cum[j] - cum[j - 1] || 1
    out.push(lerp(pts[j - 1], pts[j], (target - cum[j - 1]) / seg))
  }
  return out
}

/** Écart de chaque segment de la cible par rapport au tracé dessiné (pour le retour). */
export function segmentErrors(target: VPath, drawn: VPath) {
  const ds = resample(sample(drawn, 40), 300)
  return segments(target).map((s) => {
    let sum = 0
    let worst = 0
    for (let k = 0; k <= 20; k++) {
      const p = cubic(s, k / 20)
      const d = Math.min(...ds.map((q) => dist(p, q)))
      sum += d
      worst = Math.max(worst, d)
    }
    return { mean: sum / 21, worst }
  })
}

export const clonePath = (p: VPath): VPath => ({ closed: p.closed, anchors: p.anchors.map((a) => ({ ...a, hIn: a.hIn && { ...a.hIn }, hOut: a.hOut && { ...a.hOut } })) })
