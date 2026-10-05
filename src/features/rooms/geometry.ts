import { uid } from '../../db/db'
import type { Floor, Furniture, Opening, PlanData, Pt, Wall } from './types'

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const wallLength = (w: Wall) => dist(w.a, w.b)
export const wallAngle = (w: Wall) => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
export const along = (w: Wall, t: number): Pt => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t })

/** Projection d'un point sur un mur : paramètre t (0–1) et distance. */
export function projectOnWall(w: Wall, p: Pt) {
  const dx = w.b.x - w.a.x
  const dy = w.b.y - w.a.y
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / l2))
  const q = along(w, t)
  return { t, d: dist(p, q), q }
}

export const snapGrid = (v: number, step: number) => Math.round(v / step) * step

/** Accroche aux extrémités des murs existants, puis à la grille. */
export function snapPoint(p: Pt, walls: Wall[], step: number, tol: number): Pt {
  let best: Pt | null = null
  let bd = tol
  for (const w of walls)
    for (const e of [w.a, w.b]) {
      const d = dist(p, e)
      if (d < bd) {
        bd = d
        best = e
      }
    }
  return best ? { ...best } : { x: snapGrid(p.x, step), y: snapGrid(p.y, step) }
}

/** Contraint un segment à 0°, 45° ou 90° (touche Maj, ou par défaut près de ces angles). */
export function snapAngle(a: Pt, p: Pt, force: boolean): Pt {
  const d = dist(a, p)
  const ang = Math.atan2(p.y - a.y, p.x - a.x)
  const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
  if (!force && Math.abs(snapped - ang) > 0.06) return p
  return { x: a.x + Math.cos(snapped) * d, y: a.y + Math.sin(snapped) * d }
}

export function newWall(a: Pt, b: Pt, color = '#f4efe7'): Wall {
  return { id: uid(), a: { ...a }, b: { ...b }, thickness: 12, height: 250, color }
}

/** Pièce rectangulaire : 4 murs + un sol. */
export function rectRoom(x: number, y: number, w: number, h: number, name = 'Pièce', material = 'oak'): { walls: Wall[]; floor: Floor } {
  const p = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
  return { walls: p.map((pt, i) => newWall(pt, p[(i + 1) % 4])), floor: { id: uid(), name, points: p, material } }
}

export function polygonArea(pts: Pt[]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

export function polygonCentroid(pts: Pt[]): Pt {
  const n = pts.length || 1
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }
}

export function pointInPolygon(p: Pt, pts: Pt[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if (pts[i].y > p.y !== pts[j].y > p.y && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside
  }
  return inside
}

export function planBounds(d: PlanData) {
  const pts = [...d.walls.flatMap((w) => [w.a, w.b]), ...d.floors.flatMap((f) => f.points), ...d.furniture.map((f) => ({ x: f.x, y: f.y }))]
  if (!pts.length) return { x: 0, y: 0, w: 600, h: 400 }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x || 100, h: Math.max(...ys) - y || 100 }
}

/** Coins d'un meuble (rectangle tourné). */
export function furnitureCorners(f: Furniture): Pt[] {
  const r = (f.rotation * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [
    [-f.w / 2, -f.d / 2],
    [f.w / 2, -f.d / 2],
    [f.w / 2, f.d / 2],
    [-f.w / 2, f.d / 2],
  ].map(([x, y]) => ({ x: f.x + x * c - y * s, y: f.y + x * s + y * c }))
}

export const cm = (v: number) => (v >= 100 ? `${(v / 100).toFixed(2).replace('.', ',')} m` : `${Math.round(v)} cm`)

/* ---------- pièces de départ ---------- */

function furn(type: string, x: number, y: number, w: number, d: number, h: number, color: string, rotation = 0): Furniture {
  return { id: uid(), type, x, y, w, d, h, rotation, color }
}
function opening(wall: Wall, kind: Opening['kind'], t: number, width: number): Opening {
  return { id: uid(), wallId: wall.id, kind, t, width, height: kind === 'door' ? 210 : 125, sill: kind === 'door' ? 0 : 95 }
}

export interface Starter {
  id: string
  name: string
  description: string
  build: () => PlanData
}

export const STARTERS: Starter[] = [
  { id: 'empty', name: 'Plan vide', description: 'Je dessine moi-même.', build: () => ({ walls: [], openings: [], floors: [], furniture: [], lights: [] }) },
  {
    id: 'bedroom',
    name: 'Chambre',
    description: '3,6 × 3,2 m, une fenêtre, une porte.',
    build: () => {
      const r = rectRoom(0, 0, 360, 320, 'Chambre', 'oak')
      return {
        walls: r.walls,
        floors: [r.floor],
        openings: [opening(r.walls[0], 'window', 0.5, 120), opening(r.walls[2], 'door', 0.82, 83)],
        furniture: [furn('bed', 180, 125, 160, 205, 50, '#f3efe8'), furn('nightstand', 75, 45, 45, 40, 50, '#b08a64'), furn('nightstand', 285, 45, 45, 40, 50, '#b08a64'), furn('rug', 180, 250, 200, 120, 1, '#d9c7b0')],
        lights: [{ id: uid(), x: 180, y: 160, z: 240, intensity: 1, color: '#ffe8c8' }],
      }
    },
  },
  {
    id: 'living',
    name: 'Salon',
    description: '5 × 4 m, deux fenêtres, coin canapé.',
    build: () => {
      const r = rectRoom(0, 0, 500, 400, 'Salon', 'herring')
      return {
        walls: r.walls,
        floors: [r.floor],
        openings: [opening(r.walls[0], 'window', 0.3, 140), opening(r.walls[0], 'window', 0.72, 140), opening(r.walls[3], 'door', 0.25, 90)],
        furniture: [furn('sofa', 250, 330, 210, 90, 85, '#c9b8a4', 180), furn('coffee', 250, 230, 110, 60, 40, '#b08a64'), furn('rug', 250, 240, 240, 170, 1, '#e3d6c3'), furn('tvunit', 250, 30, 160, 40, 50, '#e8e1d6'), furn('armchair', 90, 220, 85, 85, 80, '#c98b8b', 90), furn('plant', 450, 350, 45, 45, 120, '#7a9a6e')],
        lights: [{ id: uid(), x: 250, y: 200, z: 240, intensity: 1, color: '#ffe8c8' }],
      }
    },
  },
  {
    id: 'flat',
    name: 'Petit appartement',
    description: 'Séjour, chambre et salle de bain.',
    build: () => {
      const living = rectRoom(0, 0, 520, 420, 'Séjour', 'oak')
      const bed = rectRoom(520, 0, 340, 300, 'Chambre', 'carpet')
      const bath = rectRoom(520, 300, 340, 120, 'Salle de bain', 'tiles')
      // murs communs : on retire les doublons
      const walls = [...living.walls, bed.walls[0], bed.walls[1], bed.walls[2], bath.walls[1], bath.walls[2]]
      const inner = bed.walls[3] // déjà couvert par le mur droit du séjour, on le garde pour les portes
      void inner
      const lw = living.walls
      return {
        walls,
        floors: [living.floor, bed.floor, bath.floor],
        openings: [
          opening(lw[0], 'window', 0.5, 160),
          opening(lw[3], 'door', 0.5, 90),
          opening(lw[1], 'door', 0.35, 83),
          opening(lw[1], 'door', 0.86, 73),
          opening(bed.walls[0], 'window', 0.5, 120),
        ],
        furniture: [
          furn('sofa', 210, 340, 210, 90, 85, '#c9b8a4', 180),
          furn('coffee', 210, 250, 110, 60, 40, '#b08a64'),
          furn('table', 400, 120, 160, 90, 75, '#b08a64', 90),
          furn('chair', 345, 120, 45, 50, 85, '#5b534b', 90),
          furn('chair', 455, 120, 45, 50, 85, '#5b534b', 270),
          furn('counter', 130, 35, 240, 62, 90, '#efeae2'),
          furn('bed', 700, 125, 160, 205, 50, '#f3efe8'),
          furn('wardrobe', 800, 260, 120, 60, 210, '#ece6dc', 180),
          furn('bathtub', 640, 380, 170, 75, 58, '#ffffff'),
          furn('sink', 800, 335, 70, 48, 85, '#ffffff', 270),
        ],
        lights: [
          { id: uid(), x: 210, y: 220, z: 240, intensity: 1, color: '#ffe8c8' },
          { id: uid(), x: 690, y: 150, z: 240, intensity: 0.8, color: '#ffe8c8' },
          { id: uid(), x: 690, y: 360, z: 240, intensity: 0.7, color: '#ffffff' },
        ],
      }
    },
  },
]
