import * as THREE from 'three'
import { MATERIALS, catalogItem, modelOf } from './catalog'
import { wallAngle, wallLength } from './geometry'
import type { Furniture, Opening, PlanData, RoomPlan, Wall } from './types'

/**
 * La 3D est générée à partir du plan : mêmes murs, ouvertures et meubles, même disposition.
 * Pensée pour un ordinateur modeste : géométries partagées (une seule boîte, un seul cylindre…
 * mis à l'échelle), matériaux en cache, ombres « de contact » peintes plutôt que calculées,
 * halos lumineux en sprites additifs plutôt qu'en post-traitement.
 */

const S = 0.01 // cm → m

export type Quality = 'eco' | 'belle'

/* ---------- caches ---------- */
const matCache = new Map<string, THREE.Material>()
function std(color: string, rough = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = `${color}|${rough}|${JSON.stringify(extra)}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra })
    matCache.set(key, m)
  }
  return m
}
const glowMat = (color: string, k = 1) => std(color, 0.5, { emissive: new THREE.Color(color), emissiveIntensity: k })
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString()

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.CylinderGeometry(0, 0.5, 1, 20),
  shade: new THREE.CylinderGeometry(0.3, 0.5, 1, 20, 1, true),
  sphere: new THREE.SphereGeometry(0.5, 18, 12),
  blob: new THREE.IcosahedronGeometry(0.5, 1),
  torus: new THREE.TorusGeometry(0.5, 0.12, 8, 24),
  plane: new THREE.PlaneGeometry(1, 1),
  arc: new THREE.TorusGeometry(1, 0.015, 6, 20, Math.PI / 2),
}

let shadowsOn = true
function prep<T extends THREE.Mesh>(m: T, cast = true) {
  m.castShadow = cast && shadowsOn
  m.receiveShadow = shadowsOn
  return m
}
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = prep(new THREE.Mesh(G.box, mat))
  m.scale.set(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001))
  m.position.set(x, y, z)
  return m
}
function cyl(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, low = false) {
  const m = prep(new THREE.Mesh(low ? G.cylLow : G.cyl, mat))
  m.scale.set(r * 2, h, r * 2)
  m.position.set(x, y, z)
  return m
}
function geo(g: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) {
  const m = prep(new THREE.Mesh(g, mat))
  m.scale.set(sx, sy, sz)
  m.position.set(x, y, z)
  return m
}

/* ---------- textures procédurales ---------- */
function canvasTex(size: number, draw: (x: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

const texCache = new Map<string, THREE.Texture>()
function floorTexture(materialId: string) {
  const mat = MATERIALS.find((m) => m.id === materialId) ?? MATERIALS[0]
  if (texCache.has(mat.id)) return texCache.get(mat.id)!
  const sh = (k: number) => shade(mat.color, k)
  const t = canvasTex(512, (x) => {
    x.fillStyle = mat.color
    x.fillRect(0, 0, 512, 512)
    if (mat.pattern === 'planks') {
      for (let row = 0; row < 8; row++) {
        const off = (row * 157) % 512
        for (let k = -1; k < 3; k++) {
          x.fillStyle = sh(0.9 + ((row * 7 + k * 3) % 5) * 0.035)
          x.fillRect(off + k * 300 - 300, row * 64, 296, 62)
          // veinage léger
          x.strokeStyle = sh(0.86)
          x.globalAlpha = 0.35
          for (let v = 0; v < 3; v++) {
            x.beginPath()
            const y0 = row * 64 + 12 + v * 16
            x.moveTo(off + k * 300 - 300, y0)
            x.bezierCurveTo(off + k * 300 - 200, y0 + 5, off + k * 300 - 100, y0 - 5, off + k * 300, y0)
            x.stroke()
          }
          x.globalAlpha = 1
        }
        x.fillStyle = sh(0.72)
        x.fillRect(0, row * 64 + 62, 512, 2)
      }
    } else if (mat.pattern === 'tiles') {
      x.fillStyle = sh(0.82)
      x.fillRect(0, 0, 512, 512)
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          x.fillStyle = sh(0.95 + ((i + j * 3) % 4) * 0.02)
          x.fillRect(i * 128 + 2, j * 128 + 2, 124, 124)
        }
    } else if (mat.pattern === 'checker') {
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          x.fillStyle = (i + j) % 2 ? '#2e2a26' : mat.color
          x.fillRect(i * 128, j * 128, 128, 128)
        }
    } else if (mat.pattern === 'herringbone') {
      for (let i = -8; i < 16; i++)
        for (let j = -8; j < 16; j++) {
          x.save()
          x.translate(i * 64, j * 64 + (i % 2) * 32)
          x.rotate(((i + j) % 2 ? 1 : -1) * (Math.PI / 4))
          x.fillStyle = sh(0.88 + ((((i * 3 + j) % 5) + 5) % 5) * 0.03)
          x.fillRect(0, 0, 88, 22)
          x.restore()
        }
    } else if (mat.pattern === 'grass') {
      for (let i = 0; i < 9000; i++) {
        x.fillStyle = sh(0.8 + Math.random() * 0.35)
        x.fillRect(Math.random() * 512, Math.random() * 512, 2, 4)
      }
    } else {
      for (let i = 0; i < 2500; i++) {
        x.fillStyle = sh(0.94 + Math.random() * 0.1)
        x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
      }
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  texCache.set(mat.id, t)
  return t
}

/** Halo doux (dégradé radial) : lumières, ombres de contact. */
let haloTex: THREE.Texture | null = null
function halo() {
  return (haloTex ??= canvasTex(128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 128, 128)
  }))
}
let contactTex: THREE.Texture | null = null
let contactMat: THREE.MeshBasicMaterial | null = null
function contactShadow(w: number, d: number) {
  contactTex ??= canvasTex(
    128,
    (x) => {
      const g = x.createRadialGradient(64, 64, 10, 64, 64, 64)
      g.addColorStop(0, 'rgba(40,30,25,0.55)')
      g.addColorStop(0.6, 'rgba(40,30,25,0.22)')
      g.addColorStop(1, 'rgba(40,30,25,0)')
      x.fillStyle = g
      x.fillRect(0, 0, 128, 128)
    },
    false,
  )
  contactMat ??= new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false })
  const m = new THREE.Mesh(G.plane, contactMat)
  m.rotation.x = -Math.PI / 2
  m.scale.set(w * 1.35, d * 1.35, 1)
  m.position.y = 0.004
  m.renderOrder = 1
  return m
}

/* ---------- murs avec ouvertures ---------- */
function wallGroup(w: Wall, openings: Opening[], cut: number | null) {
  const g = new THREE.Group()
  const L = wallLength(w) * S
  const H = (cut ?? w.height) * S
  const T = w.thickness * S
  const mat = std(w.color, 0.92)
  const ops = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => ({ ...o, s: o.t * L - (o.width * S) / 2, e: o.t * L + (o.width * S) / 2 }))
    .sort((a, b) => a.s - b.s)
  let cur = 0
  const piece = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 < 0.001 || y1 - y0 < 0.001) return
    g.add(box(x1 - x0, y1 - y0, T, mat, (x0 + x1) / 2, (y0 + y1) / 2, 0))
  }
  for (const o of ops) {
    const s = Math.max(cur, o.s)
    piece(cur, s, 0, H)
    const bottom = o.sill * S
    const top = (o.sill + o.height) * S
    piece(s, o.e, 0, Math.min(bottom, H))
    if (top < H) piece(s, o.e, top, H)
    const ow = o.e - s
    const cx = (s + o.e) / 2
    if (o.kind === 'window' && bottom < H) {
      const visTop = Math.min(top, H)
      const glass = new THREE.Mesh(G.box, std('#cfe3ee', 0.05, { transparent: true, opacity: 0.3, emissive: new THREE.Color('#bfe0ff'), emissiveIntensity: 0.25 }))
      glass.scale.set(ow, visTop - bottom, 0.01)
      glass.position.set(cx, (bottom + visTop) / 2, 0)
      g.add(glass)
      const frame = std('#ffffff', 0.5)
      g.add(box(ow, 0.04, T + 0.02, frame, cx, bottom, 0))
      if (top <= H) g.add(box(ow, 0.04, T + 0.02, frame, cx, visTop, 0))
      g.add(box(0.04, visTop - bottom, T + 0.02, frame, s + 0.02, (bottom + visTop) / 2, 0))
      g.add(box(0.04, visTop - bottom, T + 0.02, frame, o.e - 0.02, (bottom + visTop) / 2, 0))
      g.add(box(0.03, visTop - bottom, 0.04, frame, cx, (bottom + visTop) / 2, 0))
    } else if (o.kind === 'door') {
      const dh = Math.min(top, H)
      const leaf = box(ow - 0.02, dh - 0.01, 0.04, std('#e9e1d3', 0.6), 0, dh / 2, 0)
      const hinge = new THREE.Group()
      hinge.position.set(o.flip ? o.e : s, 0, T / 2)
      leaf.position.x = o.flip ? -(ow / 2) : ow / 2
      hinge.add(leaf)
      hinge.rotation.y = (o.flip ? -1 : 1) * -0.45
      g.add(hinge)
    }
    cur = Math.max(cur, o.e)
  }
  piece(cur, L, 0, H)
  g.position.set(w.a.x * S, 0, w.a.y * S)
  g.rotation.y = -wallAngle(w)
  return g
}

/* ---------- meubles ---------- */
const BOOKS = ['#c98b8b', '#7f9db5', '#e8b60f', '#8fa58a', '#a397c4', '#f3efe8', '#c8805f']

export function furnitureMesh(f: Furniture) {
  const g = new THREE.Group()
  const W = f.w * S
  const D = f.d * S
  const Hh = f.h * S
  const c = std(f.color, 0.75)
  const cSoft = std(f.color, 0.95)
  const wood = std('#b08a64', 0.6)
  const dark = std('#3a332d', 0.55)
  const white = std('#ffffff', 0.35)
  const metal = std('#c9c9c9', 0.3, { metalness: 0.6 })
  const add = (...m: THREE.Object3D[]) => g.add(...m)
  const leg = (x: number, z: number, h: number, r = 0.02, m: THREE.Material = dark) => add(cyl(r, h, m, x, h / 2, z, true))
  const fourLegs = (h: number, inset = 0.06, r = 0.022, m: THREE.Material = dark) => {
    const ix = W / 2 - inset
    const iz = D / 2 - inset
    ;[[-ix, -iz], [ix, -iz], [ix, iz], [-ix, iz]].forEach(([x, z]) => leg(x, z, h, r, m))
  }
  const plantBall = (r: number, y: number, x = 0, z = 0, col = f.color) => add(geo(G.blob, std(col, 0.9, { flatShading: true }), r * 2, r * 2, r * 2, x, y, z))
  const pot = (r: number, h: number, col = '#c8805f') => add(geo(G.cyl, std(col, 0.8), r * 2, h, r * 2, 0, h / 2, 0))
  /** toit à deux pans (faîtage le long de la profondeur) */
  const roof = (w: number, d: number, y0: number, rise: number, mat: THREE.Material, cast = true) => {
    const half = w / 2
    const len = Math.hypot(half, rise)
    const ang = Math.atan2(rise, half)
    for (const sx of [-1, 1]) {
      const p = prep(box(len, 0.03, d, mat, (sx * half) / 2, y0 + rise / 2, 0), cast)
      p.rotation.z = sx * -ang
      add(p)
    }
  }

  switch (modelOf(f.type)) {
    case 'sofa':
    case 'armchair': {
      const armW = Math.min(0.18, W * 0.15)
      add(box(W, 0.12, D, dark, 0, 0.1, 0))
      add(box(W - armW * 2, 0.16, D * 0.75, cSoft, 0, 0.32, D * 0.1))
      add(box(W, Hh - 0.12, D * 0.25, cSoft, 0, 0.12 + (Hh - 0.12) / 2, -D / 2 + D * 0.125))
      add(box(armW, Hh * 0.7, D, cSoft, -W / 2 + armW / 2, 0.12 + Hh * 0.35, 0))
      add(box(armW, Hh * 0.7, D, cSoft, W / 2 - armW / 2, 0.12 + Hh * 0.35, 0))
      // coussins
      const n = Math.max(1, Math.round((W - armW * 2) / 0.6))
      const cw = (W - armW * 2) / n
      for (let i = 0; i < n; i++) add(box(cw - 0.03, 0.08, D * 0.7, cSoft, -W / 2 + armW + cw * (i + 0.5), 0.44, D * 0.12))
      break
    }
    case 'sofal': {
      const seatD = Math.min(0.95, D)
      add(box(W, 0.12, seatD, dark, 0, 0.1, -D / 2 + seatD / 2))
      add(box(seatD, 0.12, D, dark, W / 2 - seatD / 2, 0.1, 0))
      add(box(W, 0.18, seatD * 0.75, cSoft, 0, 0.33, -D / 2 + seatD * 0.62))
      add(box(seatD * 0.75, 0.18, D, cSoft, W / 2 - seatD * 0.62, 0.33, 0))
      add(box(W, Hh - 0.12, 0.22, cSoft, 0, 0.12 + (Hh - 0.12) / 2, -D / 2 + 0.11))
      add(box(0.18, Hh * 0.65, seatD, cSoft, -W / 2 + 0.09, 0.12 + Hh * 0.32, -D / 2 + seatD / 2))
      add(box(0.22, Hh - 0.12, D, cSoft, W / 2 - 0.11, 0.12 + (Hh - 0.12) / 2, 0))
      break
    }
    case 'pouf':
      add(geo(G.cyl, cSoft, W, Hh * 0.9, D, 0, Hh * 0.45, 0))
      add(geo(G.sphere, cSoft, W, Hh * 0.25, D, 0, Hh * 0.9, 0))
      break
    case 'beanbag':
      add(geo(G.sphere, cSoft, W, Hh * 1.1, D, 0, Hh * 0.45, 0))
      break
    case 'table': {
      add(box(W, 0.04, D, c, 0, Hh - 0.02, 0))
      fourLegs(Hh - 0.04, 0.06, 0.022, f.type === 'desk' ? dark : wood)
      break
    }
    case 'roundtable':
      add(geo(G.cyl, c, W, 0.04, D, 0, Hh - 0.02, 0))
      add(cyl(0.04, Hh - 0.04, dark, 0, (Hh - 0.04) / 2, 0))
      add(geo(G.cyl, dark, W * 0.45, 0.03, D * 0.45, 0, 0.015, 0))
      break
    case 'chair':
    case 'officechair': {
      add(box(W, 0.05, D, c, 0, 0.46, 0))
      add(box(W, Hh - 0.48, 0.04, c, 0, 0.48 + (Hh - 0.48) / 2, -D / 2 + 0.02))
      if (f.type === 'officechair') {
        add(cyl(0.03, 0.4, dark, 0, 0.22, 0))
        add(geo(G.cylLow, dark, 0.56, 0.03, 0.56, 0, 0.03, 0))
      } else [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => leg(((sx * W) / 2) * 0.85, ((sz * D) / 2) * 0.85, 0.44, 0.015))
      break
    }
    case 'stool':
      add(geo(G.cyl, c, W, 0.05, D, 0, Hh - 0.025, 0))
      ;[0, 1, 2].forEach((i) => {
        const a = (i / 3) * Math.PI * 2
        leg(Math.cos(a) * W * 0.32, Math.sin(a) * D * 0.32, Hh - 0.05, 0.015)
      })
      add(geo(G.torus, dark, W * 0.6, D * 0.6, 0.3, 0, Hh * 0.35, 0).rotateX(Math.PI / 2))
      break
    case 'bench':
      add(box(W, 0.05, D, c, 0, Hh - 0.025, 0))
      add(box(0.04, Hh - 0.05, D * 0.8, c, -W / 2 + 0.08, (Hh - 0.05) / 2, 0))
      add(box(0.04, Hh - 0.05, D * 0.8, c, W / 2 - 0.08, (Hh - 0.05) / 2, 0))
      break
    case 'bed': {
      add(box(W, 0.25, D, wood, 0, 0.125, 0))
      add(box(W - 0.04, 0.2, D - 0.04, white, 0, 0.35, 0))
      add(box(W - 0.02, 0.07, D * 0.68, cSoft, 0, 0.48, D * 0.15))
      add(box(W, 0.9, 0.06, wood, 0, 0.45, -D / 2 + 0.03))
      const two = W > 1.3
      const pw = two ? W / 2 - 0.08 : W - 0.12
      ;(two ? [-W / 4, W / 4] : [0]).forEach((x) => add(box(pw, 0.1, 0.4, white, x, 0.5, -D / 2 + 0.3)))
      break
    }
    case 'bunk': {
      ;[0.15, 1.05].forEach((y) => {
        add(box(W, 0.06, D, c, 0, y + 0.03, 0))
        add(box(W - 0.06, 0.14, D - 0.06, white, 0, y + 0.13, 0))
        add(box(W - 0.06, 0.04, D * 0.6, std('#efe2c8', 0.9), 0, y + 0.22, D * 0.15))
      })
      fourLegs(Hh, 0.03, 0.03, c)
      add(box(W, 0.2, 0.03, c, 0, 1.35, D / 2 - 0.02))
      for (let i = 0; i < 4; i++) add(box(0.4, 0.025, 0.025, c, W / 2 + 0.02, 0.3 + i * 0.25, D / 2 - 0.35).rotateY(Math.PI / 2))
      break
    }
    case 'crib': {
      add(box(W, 0.1, D, white, 0, 0.4, 0))
      fourLegs(Hh, 0.02, 0.02, c)
      for (const sz of [-1, 1]) add(box(W, 0.03, 0.03, c, 0, Hh - 0.02, (sz * D) / 2))
      for (const sx of [-1, 1]) add(box(0.03, 0.03, D, c, (sx * W) / 2, Hh - 0.02, 0))
      const bars = Math.round(D / 0.09)
      for (let i = 1; i < bars; i++)
        for (const sx of [-1, 1]) add(cyl(0.008, Hh - 0.45, c, (sx * W) / 2, 0.45 + (Hh - 0.45) / 2, -D / 2 + (i * D) / bars, true))
      break
    }
    case 'teepee': {
      const cone = geo(G.cone, std(f.color, 0.95, { side: THREE.DoubleSide }), W, Hh * 0.85, D, 0, (Hh * 0.85) / 2, 0)
      add(cone)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const p = cyl(0.015, Hh, wood, Math.cos(a) * W * 0.22, Hh / 2, Math.sin(a) * D * 0.22, true)
        p.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28)
        add(p)
      }
      add(geo(G.cylLow, std('#c98b8b', 0.9), W * 0.75, 0.03, D * 0.75, 0, 0.015, 0))
      break
    }
    case 'toybox':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(box(W + 0.02, 0.04, D + 0.02, std(shade(f.color, 0.85), 0.7), 0, Hh, 0))
      add(geo(G.sphere, std('#c98b8b', 0.5), 0.12, 0.12, 0.12, -W * 0.25, Hh + 0.08, 0))
      add(box(0.1, 0.1, 0.1, std('#7f9db5', 0.6), W * 0.2, Hh + 0.07, 0.02))
      break
    case 'teddy': {
      const fur = std(f.color, 1)
      add(geo(G.sphere, fur, W * 0.8, Hh * 0.55, D * 0.8, 0, Hh * 0.28, 0))
      add(geo(G.sphere, fur, W * 0.6, Hh * 0.42, D * 0.6, 0, Hh * 0.72, 0.02))
      for (const sx of [-1, 1]) {
        add(geo(G.sphere, fur, W * 0.22, W * 0.22, W * 0.12, sx * W * 0.24, Hh * 0.93, 0))
        add(geo(G.sphere, fur, W * 0.25, W * 0.25, W * 0.35, sx * W * 0.25, Hh * 0.1, D * 0.25))
      }
      add(geo(G.sphere, std(shade(f.color, 1.25), 1), W * 0.22, W * 0.16, W * 0.2, 0, Hh * 0.68, D * 0.3))
      break
    }
    case 'ball':
      add(geo(G.sphere, std(f.color, 0.4), W, Hh, D, 0, Hh / 2, 0))
      break
    case 'rocking': {
      add(geo(G.torus, wood, D, D, 0.4, -W * 0.35, 0.02, 0).rotateY(Math.PI / 2))
      add(geo(G.torus, wood, D, D, 0.4, W * 0.35, 0.02, 0).rotateY(Math.PI / 2))
      add(box(W * 0.6, 0.18, D * 0.55, c, 0, Hh * 0.55, 0))
      add(box(W * 0.5, 0.2, 0.14, c, 0, Hh * 0.82, D * 0.3))
      add(box(0.05, 0.12, 0.2, dark, 0, Hh * 0.95, D * 0.25))
      break
    }
    case 'rug':
      add(prep(box(W, 0.008, D, cSoft, 0, 0.005, 0), false))
      break
    case 'roundrug':
      add(prep(geo(G.cyl, cSoft, W, 0.008, D, 0, 0.005, 0), false))
      break
    case 'plant':
      pot(W * 0.3, 0.35)
      plantBall(W * 0.55, 0.35 + (Hh - 0.35) * 0.45)
      plantBall(W * 0.4, 0.35 + (Hh - 0.35) * 0.8, W * 0.08, 0)
      break
    case 'tallplant': {
      pot(W * 0.25, 0.4, '#efe9e0')
      add(cyl(0.025, Hh * 0.6, wood, 0, 0.4 + Hh * 0.3, 0, true))
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const leaf = geo(G.sphere, std(f.color, 0.8, { flatShading: true }), W * 0.55, 0.05, W * 0.18, Math.cos(a) * W * 0.25, Hh * (0.72 + (i % 3) * 0.08), Math.sin(a) * W * 0.25)
        leaf.rotation.set(0, -a, -0.35)
        add(leaf)
      }
      break
    }
    case 'smallplant':
      pot(W * 0.35, Hh * 0.4, '#efe9e0')
      plantBall(W * 0.45, Hh * 0.65)
      break
    case 'cactus': {
      pot(W * 0.4, 0.2)
      const g2 = std(f.color, 0.7)
      add(geo(G.sphere, g2, W * 0.45, Hh - 0.15, W * 0.45, 0, 0.15 + (Hh - 0.15) / 2, 0))
      add(geo(G.sphere, g2, W * 0.22, Hh * 0.35, W * 0.22, W * 0.28, Hh * 0.6, 0))
      add(geo(G.sphere, g2, W * 0.2, Hh * 0.28, W * 0.2, -W * 0.27, Hh * 0.5, 0))
      add(geo(G.sphere, std('#f2a0c0', 0.6), 0.05, 0.04, 0.05, 0, Hh + 0.01, 0))
      break
    }
    case 'flowers': {
      add(geo(G.cyl, std('#cfe3ee', 0.1, { transparent: true, opacity: 0.6 }), W * 0.5, Hh * 0.45, W * 0.5, 0, Hh * 0.225, 0))
      const cols = [f.color, '#ffffff', '#e8b60f', '#c98b8b']
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4
        add(geo(G.sphere, std(cols[i % 4], 0.7), 0.07, 0.06, 0.07, Math.cos(a) * W * 0.25, Hh * (0.8 + (i % 3) * 0.07), Math.sin(a) * W * 0.25))
      }
      plantBall(W * 0.3, Hh * 0.62, 0, 0, '#7a9a6e')
      break
    }
    case 'hanging': {
      add(cyl(0.004, 0.6, dark, 0, Hh + 0.3, 0, true))
      add(geo(G.sphere, std('#efe9e0', 0.6), W * 0.55, Hh * 0.35, W * 0.55, 0, Hh * 0.8, 0))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        add(geo(G.blob, std(f.color, 0.9, { flatShading: true }), 0.12, Hh * 0.75, 0.12, Math.cos(a) * W * 0.3, Hh * 0.5, Math.sin(a) * W * 0.3))
      }
      break
    }
    case 'tree':
      add(cyl(W * 0.06, Hh * 0.5, std('#7a5a40', 0.9), 0, Hh * 0.25, 0, true))
      plantBall(W * 0.45, Hh * 0.62)
      plantBall(W * 0.32, Hh * 0.8, W * 0.15, -W * 0.1, shade(f.color, 1.12))
      plantBall(W * 0.3, Hh * 0.55, -W * 0.2, W * 0.12, shade(f.color, 0.9))
      break
    case 'pine':
      add(cyl(W * 0.06, Hh * 0.25, std('#7a5a40', 0.9), 0, Hh * 0.12, 0, true))
      ;[0, 1, 2].forEach((i) => add(geo(G.cone, std(f.color, 0.9, { flatShading: true }), W * (1 - i * 0.25), Hh * 0.4, D * (1 - i * 0.25), 0, Hh * (0.35 + i * 0.22), 0)))
      break
    case 'bush':
      plantBall(W * 0.5, Hh * 0.5)
      plantBall(W * 0.35, Hh * 0.45, W * 0.25, D * 0.1, shade(f.color, 1.1))
      plantBall(W * 0.32, Hh * 0.4, -W * 0.25, -D * 0.05, shade(f.color, 0.9))
      break
    case 'lamp': {
      add(cyl(0.15, 0.03, dark, 0, 0.015, 0))
      add(cyl(0.012, Hh - 0.3, dark, 0, (Hh - 0.3) / 2, 0, true))
      add(geo(G.shade, glowMat(f.color, 0.45), 0.4, 0.3, 0.4, 0, Hh - 0.15, 0))
      break
    }
    case 'arclamp': {
      const z0 = -D / 2 + 0.15
      const R = Math.max(0.3, Math.min(D - 0.3, Hh - 0.5))
      const h1 = Hh - R
      const steel = std(f.color, 0.3, { metalness: 0.5 })
      add(box(0.3, 0.06, 0.3, std('#efe9e0', 0.4), 0, 0.03, z0))
      add(cyl(0.015, h1, steel, 0, h1 / 2, z0, true))
      const arc = new THREE.Group()
      const t = prep(new THREE.Mesh(G.arc, steel))
      t.scale.set(R, R, 1)
      t.rotation.z = Math.PI / 2
      t.position.set(R, h1, 0)
      arc.add(t)
      arc.rotation.y = -Math.PI / 2
      arc.position.z = z0
      add(arc)
      add(geo(G.sphere, glowMat('#fff2d8', 0.8), 0.32, 0.18, 0.32, 0, Hh - 0.12, z0 + R))
      break
    }
    case 'tablelamp':
      add(geo(G.sphere, std('#c8805f', 0.5), W * 0.55, Hh * 0.45, W * 0.55, 0, Hh * 0.22, 0))
      add(geo(G.shade, glowMat(f.color, 0.5), W, Hh * 0.45, D, 0, Hh * 0.72, 0))
      break
    case 'pendant':
      add(cyl(0.004, 0.2, dark, 0, Hh + 0.1, 0, true))
      add(geo(G.cone, std(f.color, 0.4, { side: THREE.DoubleSide }), W, Hh * 0.6, D, 0, Hh * 0.35, 0))
      add(geo(G.sphere, glowMat('#fff2d8', 1.5), 0.08, 0.08, 0.08, 0, 0.06, 0))
      break
    case 'candles':
      ;[[-0.07, 0.18], [0, 0.12], [0.07, 0.15]].forEach(([x, h]) => {
        add(cyl(0.025, h, std(f.color, 0.6), x, h / 2, 0))
        add(geo(G.sphere, glowMat('#ffb066', 2), 0.02, 0.04, 0.02, x, h + 0.025, 0))
      })
      break
    case 'fairy': {
      add(cyl(0.003, W, dark, 0, Hh / 2, 0, true).rotateZ(Math.PI / 2))
      const n = Math.round(W / 0.12)
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const sag = Math.sin(t * Math.PI * 3) * Hh * 0.4
        add(prep(geo(G.sphere, glowMat(f.color, 2), 0.035, 0.035, 0.035, -W / 2 + t * W, Hh / 2 - Math.abs(sag), 0), false))
      }
      break
    }
    case 'neon': {
      const pink = glowMat(f.color, 2.2)
      const l = geo(G.torus, pink, W * 0.5, W * 0.5, 0.3, -W * 0.14, Hh * 0.6, 0)
      const r = geo(G.torus, pink, W * 0.5, W * 0.5, 0.3, W * 0.14, Hh * 0.6, 0)
      add(l, r)
      add(geo(G.cone, pink, W * 0.02, Hh * 0.5, 0.02, 0, Hh * 0.25, 0))
      add(box(W, Hh, 0.01, std('#ffffff', 0.1, { transparent: true, opacity: 0.15 }), 0, Hh / 2, -0.02))
      break
    }
    case 'lantern':
      add(box(W, 0.03, D, c, 0, 0.015, 0))
      add(box(W, 0.04, D, c, 0, Hh - 0.08, 0))
      add(geo(G.torus, c, W * 0.5, W * 0.5, 0.3, 0, Hh - 0.02, 0))
      add(box(W * 0.8, Hh - 0.12, D * 0.8, std('#ffe8c0', 0.2, { transparent: true, opacity: 0.45 }), 0, Hh / 2 - 0.02, 0))
      add(geo(G.sphere, glowMat('#ffb066', 2), 0.05, 0.08, 0.05, 0, Hh * 0.45, 0))
      break
    case 'fireplace': {
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(box(W + 0.1, 0.06, D + 0.08, std(shade(f.color, 0.9), 0.5), 0, Hh + 0.03, 0.02))
      add(box(W * 0.55, Hh * 0.5, 0.02, std('#1d1714', 0.9), 0, Hh * 0.3, D / 2 + 0.002))
      add(geo(G.cone, glowMat('#ff9440', 2.5), 0.25, 0.3, 0.06, 0, 0.25, D / 2 - 0.02))
      add(geo(G.cone, glowMat('#ffd38a', 3), 0.12, 0.18, 0.05, 0.08, 0.2, D / 2 - 0.01))
      break
    }
    case 'radiator': {
      const n = Math.round(W / 0.06)
      for (let i = 0; i < n; i++) add(box(0.04, Hh, D, c, -W / 2 + 0.03 + i * (W / n), Hh / 2, 0))
      break
    }
    case 'bookcase': {
      const T = 0.025
      add(box(T, Hh, D, c, -W / 2 + T / 2, Hh / 2, 0))
      add(box(T, Hh, D, c, W / 2 - T / 2, Hh / 2, 0))
      add(box(W, Hh, 0.01, c, 0, Hh / 2, -D / 2 + 0.005))
      const shelves = Math.max(2, Math.round(Hh / 0.38))
      for (let i = 0; i <= shelves; i++) add(box(W, T, D, c, 0, (i * (Hh - T)) / shelves + T / 2, 0))
      // livres
      for (let i = 0; i < shelves; i++) {
        let x = -W / 2 + 0.04
        let k = i * 3
        const y0 = (i * (Hh - T)) / shelves + T
        while (x < W / 2 - 0.12 - (i % 2) * 0.2) {
          const bw = 0.03 + ((k * 7) % 4) * 0.008
          const bh = 0.2 + ((k * 5) % 5) * 0.025
          add(box(bw, bh, D * 0.75, std(BOOKS[k % BOOKS.length], 0.8), x + bw / 2, y0 + bh / 2, 0))
          x += bw + 0.004
          k++
        }
      }
      break
    }
    case 'wallshelf':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      ;[0, 1, 2, 3].forEach((i) => add(box(0.035, 0.2, D * 0.7, std(BOOKS[i + 1], 0.8), -W / 2 + 0.06 + i * 0.04, Hh + 0.1, 0)))
      add(geo(G.blob, std('#7a9a6e', 0.9, { flatShading: true }), 0.15, 0.15, 0.15, W * 0.3, Hh + 0.12, 0))
      break
    case 'tvunit':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(box(W * 0.75, 0.5, 0.04, dark, 0, Hh + 0.3, 0))
      add(box(W * 0.73, 0.46, 0.005, std('#1a2230', 0.1, { emissive: new THREE.Color('#2a3a55'), emissiveIntensity: 0.4 }), 0, Hh + 0.3, 0.022))
      break
    case 'wardrobe':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(box(0.008, Hh - 0.1, 0.01, dark, 0, Hh / 2, D / 2 + 0.001))
      add(box(0.015, 0.25, 0.02, metal, -0.05, Hh / 2, D / 2 + 0.01))
      add(box(0.015, 0.25, 0.02, metal, 0.05, Hh / 2, D / 2 + 0.01))
      break
    case 'cabinet': {
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      const rows = Math.max(1, Math.min(4, Math.round(Hh / 0.25)))
      for (let i = 1; i < rows; i++) add(box(W - 0.04, 0.006, 0.01, dark, 0, (Hh * i) / rows, D / 2 + 0.001))
      for (let i = 0; i < rows; i++) add(box(Math.min(0.12, W * 0.3), 0.015, 0.02, metal, 0, (Hh * (i + 0.5)) / rows, D / 2 + 0.01))
      break
    }
    case 'vanity':
      add(box(W, 0.04, D, c, 0, Hh - 0.02, 0))
      fourLegs(Hh - 0.04, 0.04, 0.018, c)
      add(geo(G.cyl, std('#e4ecf2', 0.05, { metalness: 0.9 }), W * 0.55, 0.65, 0.02, 0, Hh + 0.4, -D / 2 + 0.05).rotateX(Math.PI / 2))
      break
    case 'mirror':
      add(box(W, Hh, 0.04, c, 0, Hh / 2, 0))
      add(box(W - 0.06, Hh - 0.06, 0.01, std('#e4ecf2', 0.03, { metalness: 0.95 }), 0, Hh / 2, 0.022))
      add(box(0.03, Hh * 0.7, 0.03, c, 0, Hh * 0.35, -D / 2 + 0.05).rotateX(-0.3))
      break
    case 'clothesrack': {
      add(cyl(0.012, W, c, 0, Hh, 0, true).rotateZ(Math.PI / 2))
      for (const sx of [-1, 1]) {
        add(cyl(0.015, Hh, c, (sx * W) / 2, Hh / 2, 0, true))
        add(box(0.03, 0.03, D, c, (sx * W) / 2, 0.015, 0))
      }
      ;['#c98b8b', '#f3efe8', '#7f9db5', '#e8b60f', '#2e2a26'].forEach((col, i) => add(box(0.06, 0.8, 0.4, std(col, 0.95), -W / 2 + 0.2 + i * (W - 0.4) / 4, Hh - 0.45, 0)))
      break
    }
    case 'counter':
      add(box(W, Hh - 0.04, D, c, 0, (Hh - 0.04) / 2, 0))
      add(box(W + 0.02, 0.04, D + 0.02, std('#d8d2c8', 0.35), 0, Hh - 0.02, 0))
      for (let x = -W / 2 + 0.3; x < W / 2; x += 0.6) add(box(0.12, 0.015, 0.02, metal, x, Hh - 0.15, D / 2 + 0.01))
      break
    case 'kitchensink':
      add(box(W, Hh - 0.04, D, c, 0, (Hh - 0.04) / 2, 0))
      add(box(W + 0.02, 0.04, D + 0.02, std('#d8d2c8', 0.35), 0, Hh - 0.02, 0))
      add(box(W * 0.45, 0.02, D * 0.6, std('#9aa0a6', 0.2, { metalness: 0.7 }), -W * 0.15, Hh + 0.001, 0))
      add(cyl(0.015, 0.3, metal, -W * 0.15, Hh + 0.15, -D * 0.38))
      add(box(0.02, 0.02, 0.2, metal, -W * 0.15, Hh + 0.3, -D * 0.28))
      break
    case 'stove':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(box(W, 0.01, D, std('#1d1a18', 0.15), 0, Hh + 0.005, 0))
      ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => add(prep(geo(G.torus, std('#444', 0.4), 0.14, 0.14, 0.2, sx * W * 0.22, Hh + 0.012, sz * D * 0.22).rotateX(Math.PI / 2), false)))
      add(box(W * 0.8, Hh * 0.45, 0.01, std('#1d1a18', 0.1), 0, Hh * 0.35, D / 2 + 0.002))
      break
    case 'fridge':
      add(box(W, Hh, D, std(f.color, 0.3), 0, Hh / 2, 0))
      add(box(W - 0.01, 0.006, 0.01, dark, 0, Hh * 0.62, D / 2 + 0.001))
      add(box(0.02, 0.4, 0.03, dark, W / 2 - 0.08, Hh * 0.8, D / 2 + 0.015))
      add(box(0.02, 0.4, 0.03, dark, W / 2 - 0.08, Hh * 0.4, D / 2 + 0.015))
      break
    case 'washer':
      add(box(W, Hh, D, std(f.color, 0.35), 0, Hh / 2, 0))
      add(geo(G.torus, std('#c9c9c9', 0.3), W * 0.55, W * 0.55, 0.3, 0, Hh * 0.45, D / 2))
      add(geo(G.cyl, std('#2a3340', 0.05, { transparent: true, opacity: 0.85 }), W * 0.45, 0.01, W * 0.45, 0, Hh * 0.45, D / 2).rotateX(Math.PI / 2))
      break
    case 'bathtub':
      add(box(W, Hh, D, white, 0, Hh / 2, 0))
      add(box(W - 0.12, 0.02, D - 0.12, std('#bfe0ef', 0.05, { transparent: true, opacity: 0.85 }), 0, Hh - 0.06, 0))
      break
    case 'clawtub': {
      const tub = geo(G.sphere, std(f.color, 0.3), W, Hh * 1.6, D, 0, Hh * 0.95, 0)
      add(tub)
      add(box(W * 0.85, 0.02, D * 0.75, std('#bfe0ef', 0.05, { transparent: true, opacity: 0.85 }), 0, Hh - 0.04, 0))
      ;[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => add(geo(G.sphere, std('#c9a57a', 0.3, { metalness: 0.6 }), 0.06, 0.12, 0.06, sx * W * 0.35, 0.06, sz * D * 0.3)))
      break
    }
    case 'shower': {
      add(box(W, 0.06, D, white, 0, 0.03, 0))
      const glass = std('#cfe3ee', 0.05, { transparent: true, opacity: 0.25 })
      add(prep(box(W, Hh, 0.01, glass, 0, Hh / 2, D / 2), false))
      add(prep(box(0.01, Hh, D, glass, W / 2, Hh / 2, 0), false))
      add(cyl(0.012, Hh * 0.6, metal, -W / 2 + 0.1, Hh * 0.6, -D / 2 + 0.05, true))
      add(geo(G.cyl, metal, 0.18, 0.02, 0.18, -W / 2 + 0.2, Hh * 0.92, -D / 2 + 0.15))
      break
    }
    case 'sink': {
      add(box(W, Hh - 0.15, D, c, 0, (Hh - 0.15) / 2, 0))
      add(box(W, 0.03, D, white, 0, Hh - 0.13, 0))
      const n = W > 1.1 ? 2 : 1
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : (i ? W / 4 : -W / 4)
        add(geo(G.cyl, white, 0.42, 0.12, D * 0.75, x, Hh - 0.06, 0.02))
        add(cyl(0.012, 0.18, metal, x, Hh + 0.04, -D / 2 + 0.06))
      }
      break
    }
    case 'wc':
      add(box(W, 0.4, D * 0.7, white, 0, 0.2, D * 0.12))
      add(geo(G.cyl, white, W * 1.05, 0.04, D * 0.7, 0, 0.42, D * 0.12))
      add(box(W, 0.4, 0.18, white, 0, 0.6, -D / 2 + 0.09))
      break
    case 'towelrack':
      for (const sx of [-1, 1]) add(cyl(0.012, Hh, c, (sx * W) / 2, Hh / 2, 0, true))
      for (let i = 0; i < 5; i++) add(cyl(0.008, W, c, 0, 0.1 + i * (Hh - 0.15) / 4, 0, true).rotateZ(Math.PI / 2))
      add(box(W * 0.8, Hh * 0.5, 0.03, std('#f3efe8', 1), 0, Hh * 0.6, 0.03))
      break
    case 'frame': {
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      const isMirror = f.type === 'wallmirror'
      const isCork = f.type === 'corkboard'
      if (f.type === 'whiteboard' || f.type === 'poster') {
        add(prep(box(W - 0.06, Hh - 0.06, 0.01, std(f.type === 'poster' ? '#e9c9c4' : '#ffffff', 0.3), 0, Hh / 2, D / 2 + 0.004), false))
        if (f.type === 'poster') add(prep(geo(G.cyl, std('#e8822e', 0.8), W * 0.45, 0.005, W * 0.45, 0, Hh * 0.6, D / 2 + 0.008).rotateX(Math.PI / 2), false))
        break
      }
      add(box(W - 0.06, Hh - 0.06, 0.01, isMirror ? std('#e4ecf2', 0.03, { metalness: 0.95 }) : isCork ? std('#c9a57a', 1) : std('#f3ede4', 0.9), 0, Hh / 2, D / 2 + 0.002))
      if (!isMirror) {
        // petite composition abstraite (ou notes épinglées)
        const cols = isCork ? ['#fff3b0', '#ffd1dc', '#cfe3ee', '#ffffff'] : ['#c98b8b', '#e8b60f', '#8fa58a', '#7f9db5']
        cols.forEach((col, i) => add(prep(box(isCork ? 0.12 : (W - 0.1) * 0.35, isCork ? 0.12 : (Hh - 0.1) * 0.35, 0.005, std(col, 0.8), ((i % 2) - 0.5) * (W - 0.12) * 0.45, Hh / 2 + (i < 2 ? 1 : -1) * (Hh - 0.12) * 0.2, D / 2 + 0.008), false)))
      }
      break
    }
    case 'clock':
      add(geo(G.cyl, c, W, D, Hh, 0, Hh / 2, 0).rotateX(Math.PI / 2))
      add(prep(geo(G.cyl, std('#f3efe8', 0.6), W * 0.85, 0.005, Hh * 0.85, 0, Hh / 2, D / 2 + 0.002).rotateX(Math.PI / 2), false))
      add(prep(box(0.008, Hh * 0.3, 0.004, dark, 0, Hh / 2 + Hh * 0.12, D / 2 + 0.006), false))
      add(prep(box(Hh * 0.22, 0.008, 0.004, dark, Hh * 0.1, Hh / 2, D / 2 + 0.006), false))
      break
    case 'monitor':
      add(box(W, Hh * 0.75, 0.025, c, 0, Hh * 0.6, 0))
      add(box(W - 0.03, Hh * 0.7, 0.005, std('#1a2230', 0.1, { emissive: new THREE.Color('#9fc4ff'), emissiveIntensity: 0.35 }), 0, Hh * 0.6, 0.014))
      add(box(0.04, Hh * 0.3, 0.03, c, 0, Hh * 0.15, -0.02))
      add(box(0.2, 0.01, D * 0.8, c, 0, 0.005, 0))
      break
    case 'laptop': {
      add(box(W, 0.015, D, c, 0, 0.0075, 0))
      const lid = new THREE.Group()
      lid.position.set(0, 0.015, -D / 2)
      lid.add(box(W, D, 0.01, c, 0, D / 2, 0))
      lid.add(box(W - 0.02, D - 0.02, 0.002, std('#1a2230', 0.1, { emissive: new THREE.Color('#9fc4ff'), emissiveIntensity: 0.35 }), 0, D / 2, 0.006))
      lid.rotation.x = -0.25
      add(lid)
      break
    }
    case 'piano':
      add(box(W, 0.12, D, c, 0, Hh - 0.06, 0))
      add(box(W * 0.92, 0.02, D * 0.4, white, 0, Hh + 0.01, D * 0.15))
      leg(-W / 2 + 0.05, 0, Hh - 0.12, 0.02)
      leg(W / 2 - 0.05, 0, Hh - 0.12, 0.02)
      break
    case 'uprightpiano':
      add(box(W, Hh, D * 0.55, std(f.color, 0.25), 0, Hh / 2, -D * 0.22))
      add(box(W, 0.08, D * 0.45, std(f.color, 0.25), 0, 0.7, D * 0.22))
      add(box(W * 0.94, 0.02, D * 0.3, white, 0, 0.75, D * 0.28))
      for (let i = 0; i < 36; i++) add(prep(box(0.012, 0.012, D * 0.15, dark, -W * 0.45 + i * W * 0.026, 0.765, D * 0.22), false))
      add(box(0.06, 0.65, 0.06, std(f.color, 0.25), -W / 2 + 0.05, 0.33, D * 0.35))
      add(box(0.06, 0.65, 0.06, std(f.color, 0.25), W / 2 - 0.05, 0.33, D * 0.35))
      break
    case 'guitar': {
      const body = new THREE.Group()
      body.add(geo(G.sphere, c, W * 0.9, W * 0.85, 0.1, 0, 0.25, 0))
      body.add(geo(G.sphere, c, W * 0.7, W * 0.6, 0.1, 0, 0.55, 0))
      body.add(prep(geo(G.cyl, dark, 0.09, 0.005, 0.09, 0, 0.42, 0.05).rotateX(Math.PI / 2), false))
      body.add(box(0.05, Hh * 0.45, 0.03, std('#8a6446', 0.6), 0, Hh * 0.72, 0))
      body.add(box(0.08, 0.14, 0.03, std('#8a6446', 0.6), 0, Hh - 0.05, 0))
      body.rotation.x = -0.18
      body.position.z = 0.05
      add(body)
      add(box(0.2, 0.02, 0.2, dark, 0, 0.01, -0.02))
      break
    }
    case 'drums': {
      const shell = std(f.color, 0.3)
      const cym = std('#d4b25a', 0.25, { metalness: 0.8 })
      add(geo(G.cyl, shell, 0.55, 0.45, 0.55, 0, 0.28, D * 0.1).rotateX(Math.PI / 2))
      add(geo(G.cyl, white, 0.53, 0.46, 0.53, 0, 0.28, D * 0.1 + 0.005).rotateX(Math.PI / 2))
      ;[[-0.3, 0.65, 0.33], [0.3, 0.65, 0.33], [0.45, 0.45, 0.4]].forEach(([x, y, r]) => add(geo(G.cyl, shell, r, 0.22, r, x * W, y, -D * 0.05)))
      ;[[-0.42, -0.3], [0.42, -0.3]].forEach(([x, z]) => {
        add(cyl(0.01, Hh - 0.05, metal, x * W, (Hh - 0.05) / 2, z * D, true))
        add(geo(G.cyl, cym, 0.45, 0.01, 0.45, x * W, Hh, z * D))
      })
      add(geo(G.cyl, dark, 0.32, 0.08, 0.32, 0, 0.5, -D * 0.38))
      break
    }
    case 'speaker':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(prep(geo(G.cyl, std('#555', 0.6), W * 0.75, 0.01, W * 0.75, 0, Hh * 0.35, D / 2).rotateX(Math.PI / 2), false))
      add(prep(geo(G.cyl, std('#555', 0.6), W * 0.4, 0.01, W * 0.4, 0, Hh * 0.75, D / 2).rotateX(Math.PI / 2), false))
      break
    case 'turntable':
      add(box(W, Hh - 0.12, D, c, 0, (Hh - 0.12) / 2, 0))
      add(box(W, 0.1, D, std('#2e2a26', 0.4), 0, Hh - 0.07, 0))
      add(geo(G.cyl, std('#111', 0.3), D * 0.8, 0.01, D * 0.8, -W * 0.08, Hh - 0.015, 0))
      add(geo(G.cyl, std('#c98b8b', 0.5), D * 0.25, 0.012, D * 0.25, -W * 0.08, Hh - 0.012, 0))
      add(box(0.01, 0.01, D * 0.5, metal, W * 0.35, Hh, 0))
      break
    case 'easel': {
      ;[-1, 1].forEach((sx) => add(box(0.03, Hh, 0.03, c, sx * W * 0.35, Hh / 2, 0).rotateZ(sx * 0.1)))
      add(box(0.03, Hh * 0.95, 0.03, c, 0, Hh * 0.45, -D * 0.35).rotateX(-0.35))
      add(box(W * 0.8, 0.03, 0.06, c, 0, Hh * 0.42, 0.03))
      const canvas = box(W * 0.75, W * 0.6, 0.025, std('#fbf8f2', 0.9), 0, Hh * 0.42 + W * 0.32, 0.02)
      add(canvas)
      ;['#c98b8b', '#e8b60f', '#7f9db5'].forEach((col, i) => add(prep(geo(G.sphere, std(col, 0.8), 0.12 - i * 0.02, 0.1, 0.005, -0.08 + i * 0.1, Hh * 0.42 + W * 0.3 + (i % 2) * 0.08, 0.035), false)))
      break
    }
    case 'bike':
      add(geo(G.torus, dark, 0.45, 0.45, 0.5, 0, 0.25, D * 0.3).rotateY(Math.PI / 2))
      add(box(0.06, 0.06, D * 0.7, c, 0, 0.25, 0))
      add(box(0.05, 0.75, 0.05, c, 0, 0.55, -D * 0.25).rotateX(-0.2))
      add(box(0.2, 0.06, 0.25, dark, 0, 0.93, -D * 0.3))
      add(box(0.05, 0.9, 0.05, c, 0, 0.6, D * 0.3).rotateX(0.2))
      add(box(0.45, 0.03, 0.03, dark, 0, Hh - 0.05, D * 0.38))
      add(box(0.45, 0.04, 0.12, c, 0, 0.02, -D * 0.4))
      break
    case 'aquarium': {
      add(box(W, 0.8, D, c, 0, 0.4, 0))
      const tankH = Hh - 0.8
      add(box(W, tankH, D, std('#7fc4e8', 0.05, { transparent: true, opacity: 0.35, emissive: new THREE.Color('#3aa0d8'), emissiveIntensity: 0.35 }), 0, 0.8 + tankH / 2, 0))
      add(box(W - 0.02, 0.05, D - 0.02, std('#e9dcc0', 1), 0, 0.825, 0))
      ;[['#ff8a3d', -0.2], ['#ffd34d', 0.15], ['#ff6fa8', 0.05]].forEach(([col, x], i) => add(geo(G.sphere, glowMat(col as string, 0.4), 0.07, 0.04, 0.025, (x as number) * W, 0.95 + i * 0.1, (i - 1) * 0.06)))
      plantBall(0.08, 0.9, -W * 0.35, 0, '#5f8a5a')
      plantBall(0.06, 0.88, W * 0.38, -0.05, '#7a9a6e')
      break
    }
    case 'vase':
      add(geo(G.sphere, std(f.color, 0.5), W, Hh * 0.8, D, 0, Hh * 0.4, 0))
      add(geo(G.cyl, std(f.color, 0.5), W * 0.4, Hh * 0.3, D * 0.4, 0, Hh * 0.8, 0))
      for (let i = 0; i < 3; i++) add(cyl(0.004, Hh * 0.7, std('#c9a57a', 1), (i - 1) * 0.03, Hh * 1.1, 0, true).rotateZ((i - 1) * 0.25))
      break
    case 'globe':
      add(geo(G.cyl, wood, W * 0.6, 0.03, D * 0.6, 0, 0.015, 0))
      add(cyl(0.01, Hh * 0.3, metal, 0, Hh * 0.15, 0, true))
      add(geo(G.sphere, std(f.color, 0.5), W * 0.85, W * 0.85, W * 0.85, 0, Hh * 0.6, 0))
      add(geo(G.blob, std('#8fa58a', 0.8, { flatShading: true }), W * 0.5, W * 0.4, W * 0.35, W * 0.12, Hh * 0.65, W * 0.25))
      break
    case 'screen': {
      const n = 3
      const pw = W / n
      for (let i = 0; i < n; i++) {
        const p = box(pw - 0.02, Hh, 0.025, std(f.color, 0.9), -W / 2 + pw * (i + 0.5), Hh / 2, (i % 2 ? 1 : -1) * D * 0.25)
        p.rotation.y = (i % 2 ? 1 : -1) * 0.35
        add(p)
      }
      break
    }
    case 'cushions':
      ;[[-0.25, 0], [0.25, 0.05]].forEach(([x, z], i) => add(geo(G.sphere, std(i ? shade(f.color, 1.2) : f.color, 0.95), W * 0.48, Hh, D * 0.9, x * W, Hh / 2, z)))
      break
    case 'petbed':
      add(geo(G.torus, cSoft, W * 0.75, D * 0.75, Hh * 4, 0, Hh * 0.5, 0).rotateX(Math.PI / 2))
      add(geo(G.cyl, std(shade(f.color, 1.15), 1), W * 0.7, Hh * 0.4, D * 0.7, 0, Hh * 0.2, 0))
      break
    case 'cattree': {
      const sisal = std('#d9c09a', 1)
      add(box(W, 0.05, D, cSoft, 0, 0.025, 0))
      add(cyl(0.06, Hh * 0.95, sisal, -W * 0.2, Hh * 0.47, 0))
      add(cyl(0.06, Hh * 0.55, sisal, W * 0.25, Hh * 0.28, D * 0.15))
      add(box(W * 0.7, 0.05, D * 0.6, cSoft, -W * 0.1, Hh * 0.55, 0))
      add(box(W * 0.6, 0.25, D * 0.55, cSoft, -W * 0.15, Hh - 0.12, 0))
      add(geo(G.sphere, std('#e8b60f', 0.6), 0.06, 0.06, 0.06, W * 0.2, Hh * 0.45, D * 0.2))
      break
    }
    case 'cat': {
      const fur = std(f.color, 1)
      add(geo(G.sphere, fur, W, Hh * 0.6, D * 0.75, 0, Hh * 0.32, -D * 0.05))
      add(geo(G.sphere, fur, W * 0.75, W * 0.7, W * 0.7, 0, Hh * 0.6, D * 0.3))
      for (const sx of [-1, 1]) add(geo(G.cone, fur, 0.05, 0.06, 0.04, sx * W * 0.2, Hh * 0.88, D * 0.3))
      add(geo(G.torus, fur, D * 0.5, D * 0.5, 0.25, 0, 0.05, -D * 0.25).rotateX(Math.PI / 2))
      break
    }
    case 'parasol':
      add(geo(G.cyl, dark, 0.45, 0.06, 0.45, 0, 0.03, 0))
      add(cyl(0.02, Hh, std('#efe9e0', 0.5), 0, Hh / 2, 0, true))
      add(geo(G.cone, std(f.color, 0.9, { side: THREE.DoubleSide }), W, 0.45, D, 0, Hh - 0.2, 0))
      break
    case 'lounger':
      add(box(W, 0.08, D * 0.7, c, 0, 0.3, D * 0.15))
      add(box(W, 0.08, D * 0.35, c, 0, 0.5, -D * 0.33).rotateX(0.75))
      fourLegs(0.28, 0.05, 0.015, wood)
      break
    case 'bbq':
      ;[0, 1, 2].forEach((i) => {
        const a = (i / 3) * Math.PI * 2
        add(cyl(0.015, Hh * 0.7, dark, Math.cos(a) * W * 0.3, Hh * 0.35, Math.sin(a) * D * 0.3, true))
      })
      add(geo(G.sphere, c, W, W * 0.6, D, 0, Hh * 0.75, 0))
      add(prep(geo(G.cyl, glowMat('#ff6a2a', 1.4), W * 0.85, 0.01, D * 0.85, 0, Hh * 0.78, 0), false))
      break
    case 'firepit':
      add(geo(G.cyl, c, W, Hh * 0.6, D, 0, Hh * 0.3, 0))
      for (let i = 0; i < 4; i++) add(cyl(0.035, W * 0.6, wood, 0, Hh * 0.65, 0, true).rotateZ(Math.PI / 2).rotateY((i * Math.PI) / 4))
      add(geo(G.cone, glowMat('#ff9440', 2.5), 0.3, 0.35, 0.3, 0, Hh * 0.6 + 0.17, 0))
      add(geo(G.cone, glowMat('#ffd38a', 3), 0.15, 0.25, 0.15, 0.04, Hh * 0.6 + 0.13, 0.03))
      break
    case 'pool':
      add(box(W + 0.3, 0.06, D + 0.3, std('#efe9e0', 0.7), 0, 0.03, 0))
      add(prep(box(W, 0.02, D, std(f.color, 0.05, { emissive: new THREE.Color('#2a9bd0'), emissiveIntensity: 0.35, transparent: true, opacity: 0.88 }), 0, 0.065, 0), false))
      break
    case 'fence': {
      add(box(W, 0.04, D, c, 0, Hh * 0.7, 0))
      add(box(W, 0.04, D, c, 0, Hh * 0.3, 0))
      const n = Math.round(W / 0.15)
      for (let i = 0; i <= n; i++) add(box(0.08, Hh, D, c, -W / 2 + (i * W) / n, Hh / 2, D))
      break
    }
    case 'hammock': {
      for (const sz of [-1, 1]) add(cyl(0.05, Hh, wood, 0, Hh / 2, (sz * D) / 2, true))
      const cloth = geo(G.sphere, std(f.color, 0.95, { side: THREE.DoubleSide }), W, 0.3, D * 0.8, 0, Hh * 0.5, 0)
      add(cloth)
      break
    }
    case 'path':
      ;[-0.36, -0.12, 0.12, 0.36].forEach((t, i) => add(prep(geo(G.cylLow, std(f.color, 0.95), W * (0.8 + (i % 2) * 0.15), Hh, W * 0.7, (i % 2 ? 0.1 : -0.1) * W, Hh / 2, t * D), false)))
      break
    /* ——— deuxième collection ——— */
    case 'eggchair': {
      add(geo(G.cyl, dark, W * 0.6, 0.04, D * 0.6, 0, 0.02, 0))
      add(cyl(0.025, Hh - 0.1, dark, -W * 0.25, (Hh - 0.1) / 2, -D * 0.25, true))
      add(box(W * 0.3, 0.03, 0.03, dark, -W * 0.1, Hh - 0.1, -D * 0.25))
      add(cyl(0.006, Hh * 0.35, dark, 0, Hh * 0.8, -D * 0.1, true))
      const egg = geo(G.sphere, std(f.color, 0.9, { side: THREE.DoubleSide }), W * 0.75, Hh * 0.55, D * 0.7, 0, Hh * 0.38, 0)
      add(egg)
      add(geo(G.sphere, std('#ffffff', 1), W * 0.5, 0.18, D * 0.45, 0, Hh * 0.25, D * 0.1))
      break
    }
    case 'cubeshelf': {
      const nx = Math.max(1, Math.round(W / 0.37))
      const ny = Math.max(1, Math.round(Hh / 0.37))
      const T = 0.02
      for (let i = 0; i <= nx; i++) add(box(T, Hh, D, c, -W / 2 + (i * W) / nx, Hh / 2, 0))
      for (let j = 0; j <= ny; j++) add(box(W, T, D, c, 0, (j * Hh) / ny, 0))
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++)
          if ((i * 3 + j * 5) % 3 === 0) add(box(W / nx - 0.05, Hh / ny - 0.05, D * 0.8, std(BOOKS[(i + j * 2) % BOOKS.length], 0.9), -W / 2 + (i + 0.5) * (W / nx), (j + 0.5) * (Hh / ny), 0.01))
      break
    }
    case 'ladder': {
      for (const sx of [-1, 1]) add(box(0.03, Hh, 0.04, c, (sx * W) / 2, Hh / 2, 0).rotateX(-0.18))
      const n = Math.max(3, Math.round(Hh / 0.4))
      for (let i = 0; i < n; i++) {
        const y = 0.2 + (i * (Hh - 0.3)) / (n - 1)
        const depth = D * (1 - i / n) * 0.9 + 0.08
        add(box(W, 0.02, depth, c, 0, y, D / 2 - depth / 2 - 0.05 - (y / Hh) * 0.15))
        if (i % 2 === 0) add(geo(G.blob, std('#7a9a6e', 0.9, { flatShading: true }), 0.14, 0.14, 0.14, W * 0.2, y + 0.08, D / 2 - depth / 2 - (y / Hh) * 0.15))
        else add(box(0.03, 0.18, depth * 0.7, std(BOOKS[i % BOOKS.length], 0.8), -W * 0.25, y + 0.1, D / 2 - depth / 2 - (y / Hh) * 0.15))
      }
      break
    }
    case 'barcart': {
      for (const y of [0.15, Hh - 0.02]) add(box(W, 0.02, D, std('#f3efe8', 0.2, { transparent: true, opacity: 0.7 }), 0, y, 0))
      fourLegs(Hh, 0.02, 0.01, std(f.color, 0.25, { metalness: 0.7 }))
      ;['#2e6f4a', '#8a2f3a', '#e8b60f'].forEach((col, i) => add(cyl(0.035, 0.28, std(col, 0.1, { transparent: true, opacity: 0.85 }), -W * 0.25 + i * 0.12, Hh + 0.14, 0)))
      for (const sx of [-1, 1]) add(prep(geo(G.torus, dark, 0.14, 0.14, 0.3, (sx * W) / 2, 0.07, D * 0.3).rotateY(Math.PI / 2), false))
      break
    }
    case 'coatrack': {
      add(cyl(W * 0.35, 0.03, c, 0, 0.015, 0))
      add(cyl(0.02, Hh, c, 0, Hh / 2, 0, true))
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2
        add(box(0.15, 0.02, 0.02, c, Math.cos(a) * 0.07, Hh - 0.1, Math.sin(a) * 0.07).rotateY(-a))
      }
      add(geo(G.sphere, std('#c98b8b', 0.95), 0.32, 0.8, 0.18, 0.12, Hh - 0.5, 0))
      add(geo(G.sphere, std('#e8b60f', 0.95), 0.12, 0.5, 0.12, -0.1, Hh - 0.35, 0.05))
      break
    }
    case 'shoerack': {
      for (const sx of [-1, 1]) add(box(0.02, Hh, D, c, (sx * W) / 2, Hh / 2, 0))
      for (const y of [0.04, Hh / 2, Hh - 0.01]) add(box(W, 0.02, D, c, 0, y, 0))
      const cols = ['#ffffff', '#c98b8b', '#2e2a26', '#7f9db5']
      for (let i = 0; i < 4; i++) for (const lvl of [0.05, Hh / 2 + 0.01]) add(box(0.08, 0.08, D * 0.8, std(cols[(i + (lvl > 0.1 ? 1 : 0)) % 4], 0.7), -W / 2 + 0.12 + i * (W - 0.2) / 4, lvl + 0.05, 0))
      break
    }
    case 'trashbin':
      add(geo(G.cyl, std(f.color, 0.35, { metalness: 0.4 }), W, Hh - 0.03, D, 0, (Hh - 0.03) / 2, 0))
      add(geo(G.sphere, std(f.color, 0.35, { metalness: 0.4 }), W, 0.06, D, 0, Hh - 0.03, 0))
      break
    case 'canopy': {
      add(box(W, 0.25, D, wood, 0, 0.125, 0))
      add(box(W - 0.04, 0.2, D - 0.04, white, 0, 0.35, 0))
      add(box(W - 0.02, 0.07, D * 0.68, cSoft, 0, 0.48, D * 0.15))
      ;[-W / 4, W / 4].forEach((x) => add(box(W / 2 - 0.08, 0.1, 0.4, white, x, 0.5, -D / 2 + 0.3)))
      fourLegs(Hh, 0.02, 0.025, wood)
      for (const sz of [-1, 1]) add(box(W, 0.04, 0.04, wood, 0, Hh, (sz * D) / 2 - sz * 0.02))
      for (const sx of [-1, 1]) add(box(0.04, 0.04, D, wood, (sx * W) / 2 - sx * 0.02, Hh, 0))
      const veil = std('#ffffff', 1, { transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      for (const sx of [-1, 1]) add(prep(box(0.01, Hh - 0.6, D * 0.35, veil, (sx * W) / 2, Hh - (Hh - 0.6) / 2, -D / 2 + D * 0.18), false))
      break
    }
    case 'laundry':
      add(geo(G.cyl, std(f.color, 1), W, Hh, D, 0, Hh / 2, 0))
      ;['#f3efe8', '#7f9db5', '#c98b8b'].forEach((col, i) => add(geo(G.sphere, std(col, 1), W * 0.45, 0.15, D * 0.4, (i - 1) * W * 0.18, Hh + 0.02, (i % 2) * 0.05)))
      break
    case 'ironing': {
      const board = geo(G.sphere, cSoft, W, 0.03, D, 0, Hh, 0)
      add(board)
      add(box(0.02, Hh * 1.15, 0.02, metal, 0, Hh / 2, 0).rotateZ(0.5))
      add(box(0.02, Hh * 1.15, 0.02, metal, 0, Hh / 2, 0).rotateZ(-0.5))
      add(box(0.12, 0.08, 0.08, std('#e9e9e9', 0.3), -W * 0.35, Hh + 0.05, 0))
      break
    }
    case 'highchair': {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(box(0.025, Hh * 0.7, 0.025, c, (sx * W) / 2.6, Hh * 0.33, (sz * D) / 2.6).rotateZ(-sx * 0.12))
      add(box(W * 0.6, 0.04, D * 0.55, c, 0, Hh * 0.62, 0))
      add(box(W * 0.6, Hh * 0.35, 0.03, c, 0, Hh * 0.8, -D * 0.25))
      add(box(W * 0.7, 0.03, D * 0.3, std('#c98b8b', 0.5), 0, Hh * 0.72, D * 0.3))
      break
    }
    case 'slide': {
      for (const sx of [-1, 1]) add(box(0.04, Hh, 0.04, c, (sx * W) / 2, Hh / 2, -D / 2 + 0.05))
      for (let i = 1; i < 5; i++) add(box(W, 0.03, 0.03, c, 0, (i * Hh) / 5, -D / 2 + 0.05))
      add(box(W, 0.04, 0.4, c, 0, Hh, -D / 2 + 0.2))
      const len = Math.hypot(D - 0.4, Hh)
      const ramp = box(W * 0.8, 0.03, len, std(shade(f.color, 1.1), 0.3), 0, Hh / 2, 0.2)
      ramp.rotation.x = Math.atan2(Hh, D - 0.4)
      add(ramp)
      break
    }
    case 'swing': {
      for (const sx of [-1, 1]) {
        add(box(0.06, Hh * 1.05, 0.06, wood, (sx * W) / 2, Hh / 2, -D * 0.25).rotateX(0.25))
        add(box(0.06, Hh * 1.05, 0.06, wood, (sx * W) / 2, Hh / 2, D * 0.25).rotateX(-0.25))
      }
      add(box(W + 0.1, 0.08, 0.08, wood, 0, Hh, 0))
      for (const sx of [-1, 1]) add(cyl(0.005, Hh - 0.45, dark, sx * 0.22, Hh - (Hh - 0.45) / 2, 0, true))
      add(box(0.5, 0.03, 0.2, c, 0, 0.45, 0))
      break
    }
    case 'trampoline':
      add(geo(G.cylLow, std('#222', 0.6), W * 0.9, 0.02, D * 0.9, 0, Hh * 0.6, 0))
      add(geo(G.torus, c, W * 0.95, D * 0.95, 0.5, 0, Hh * 0.6, 0).rotateX(Math.PI / 2))
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        leg(Math.cos(a) * W * 0.45, Math.sin(a) * D * 0.45, Hh * 0.6, 0.02, metal)
      }
      break
    case 'sandbox':
      for (const sz of [-1, 1]) add(box(W, Hh, 0.06, c, 0, Hh / 2, (sz * (D - 0.06)) / 2))
      for (const sx of [-1, 1]) add(box(0.06, Hh, D, c, (sx * (W - 0.06)) / 2, Hh / 2, 0))
      add(box(W - 0.1, Hh * 0.6, D - 0.1, std('#ecd9a6', 1), 0, Hh * 0.3, 0))
      add(geo(G.cone, std('#c98b8b', 0.5), 0.12, 0.1, 0.12, W * 0.2, Hh * 0.6 + 0.05, D * 0.15))
      break
    case 'dollhouse':
      add(box(W, Hh * 0.65, D, c, 0, Hh * 0.325, 0))
      roof(W, D, Hh * 0.65, Hh * 0.35, std('#c8805f', 0.8))
      for (const x of [-0.25, 0.25]) for (const y of [0.18, 0.45]) add(prep(box(W * 0.18, Hh * 0.13, 0.01, std('#fff3c8', 0.5, { emissive: new THREE.Color('#ffd38a'), emissiveIntensity: 0.3 }), x * W, y * Hh, D / 2 + 0.003), false))
      break
    case 'balloons': {
      const cols = [f.color, '#e8b60f', '#7f9db5', '#8fa58a', '#ffffff']
      add(box(0.06, 0.04, 0.06, dark, 0, 0.02, 0))
      cols.forEach((col, i) => {
        const a = i * 1.3
        const x = Math.cos(a) * W * 0.3
        const z = Math.sin(a) * D * 0.3
        const y = Hh - 0.2 - (i % 3) * 0.12
        add(prep(geo(G.sphere, std(col, 0.25), 0.26, 0.32, 0.26, x, y, z), true))
        const str = cyl(0.002, y, dark, x / 2, y / 2, z / 2, true)
        str.rotation.set(z / y, 0, -x / y)
        add(str)
      })
      break
    }
    case 'microwave':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(box(W * 0.6, Hh * 0.7, 0.005, std('#1d1a18', 0.1), -W * 0.12, Hh / 2, D / 2 + 0.003))
      break
    case 'coffeemachine':
      add(box(W, Hh, D * 0.4, c, 0, Hh / 2, -D * 0.3))
      add(box(W, 0.05, D, c, 0, 0.025, 0))
      add(box(W, 0.06, D * 0.6, c, 0, Hh - 0.03, D * 0.2))
      add(cyl(0.035, 0.07, white, 0, 0.085, D * 0.2))
      break
    case 'fruitbowl': {
      add(geo(G.sphere, std(f.color, 0.4), W, Hh * 1.2, D, 0, Hh * 0.3, 0))
      ;['#c94a3a', '#e8b60f', '#8fb07e', '#e8822e', '#c94a3a'].forEach((col, i) => {
        const a = i * 1.25
        add(geo(G.sphere, std(col, 0.5), 0.08, 0.08, 0.08, Math.cos(a) * W * 0.2, Hh * 0.85, Math.sin(a) * D * 0.2))
      })
      break
    }
    case 'winerack': {
      add(box(W, Hh, 0.01, c, 0, Hh / 2, -D / 2))
      for (const sx of [-1, 1]) add(box(0.02, Hh, D, c, (sx * W) / 2, Hh / 2, 0))
      const nx = Math.max(2, Math.round(W / 0.1))
      const ny = Math.max(2, Math.round(Hh / 0.1))
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++)
          if ((i + j * 2) % 3) add(prep(geo(G.cylLow, std(j % 2 ? '#2e4f3a' : '#5a1f2a', 0.2), 0.08, D * 0.9, 0.08, -W / 2 + (i + 0.5) * (W / nx), (j + 0.5) * (Hh / ny), 0).rotateX(Math.PI / 2), false))
      break
    }
    case 'hottub':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(prep(box(W - 0.16, 0.02, D - 0.16, std('#6fc7e6', 0.05, { emissive: new THREE.Color('#2a9bd0'), emissiveIntensity: 0.3, transparent: true, opacity: 0.88 }), 0, Hh - 0.08, 0), false))
      break
    case 'bookstack': {
      let y = 0
      let i = 0
      while (y < Hh - 0.02) {
        const bh = 0.03 + (i % 3) * 0.012
        const col = f.type === 'towels' ? (i % 2 ? f.color : '#ffffff') : BOOKS[(i + 2) % BOOKS.length]
        add(box(W * (0.85 + (i % 2) * 0.12), bh, D * (0.85 + ((i + 1) % 2) * 0.1), std(col, 0.85), (i % 2 ? 0.01 : -0.01), y + bh / 2, 0).rotateY((i % 3) * 0.06 - 0.06))
        y += bh
        i++
      }
      break
    }
    case 'printer':
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(box(W * 0.6, 0.005, D * 0.5, white, 0, Hh + 0.003, -D * 0.1))
      add(box(W * 0.3, 0.01, 0.01, dark, W * 0.3, Hh * 0.6, D / 2 + 0.003))
      break
    case 'desklamp': {
      add(geo(G.cyl, c, 0.14, 0.02, 0.14, 0, 0.01, -D * 0.2))
      add(box(0.015, Hh * 0.6, 0.015, c, 0, Hh * 0.3, -D * 0.1).rotateX(0.35))
      add(box(0.015, Hh * 0.5, 0.015, c, 0, Hh * 0.75, D * 0.05).rotateX(-0.9))
      add(geo(G.cone, std(f.color, 0.4, { side: THREE.DoubleSide }), 0.12, 0.1, 0.12, 0, Hh * 0.85, D * 0.3))
      add(geo(G.sphere, glowMat('#fff2d8', 1.5), 0.04, 0.04, 0.04, 0, Hh * 0.8, D * 0.3))
      break
    }
    case 'grandpiano': {
      const lac = std(f.color, 0.15)
      const bodyH = 0.3
      add(geo(G.cyl, lac, W, bodyH, D * 0.75, 0, Hh * 0.72, D * 0.1))
      add(box(W, bodyH, D * 0.3, lac, 0, Hh * 0.72, -D * 0.33))
      add(box(W * 0.95, 0.03, 0.18, white, 0, Hh * 0.68, -D / 2 + 0.09))
      const lid = box(W * 0.9, 0.02, D * 0.8, lac, 0, 0, 0)
      const lidG = new THREE.Group()
      lidG.position.set(-W / 2 + 0.05, Hh * 0.72 + bodyH / 2, 0)
      lid.position.set(W * 0.45, 0, 0)
      lidG.add(lid)
      lidG.rotation.z = 0.6
      add(lidG)
      for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [0, 0.4]]) leg(x * W, z * D, Hh * 0.6, 0.04, lac)
      add(box(0.7, 0.05, 0.35, lac, 0, 0.48, -D / 2 - 0.35))
      break
    }
    case 'micstand':
      add(geo(G.cylLow, dark, 0.3, 0.02, 0.3, 0, 0.01, 0))
      add(cyl(0.012, Hh, metal, 0, Hh / 2, 0, true))
      add(geo(G.sphere, std('#888', 0.3, { metalness: 0.7 }), 0.06, 0.08, 0.06, 0, Hh + 0.05, 0.05))
      break
    case 'pooltable':
    case 'pingpong': {
      const pool = modelOf(f.type) === 'pooltable'
      const top = std(f.color, pool ? 1 : 0.4)
      add(box(W, 0.04, D, top, 0, Hh - 0.02, 0))
      if (pool) {
        for (const sz of [-1, 1]) add(box(W + 0.1, 0.08, 0.06, std('#5a3a26', 0.5), 0, Hh, (sz * (D + 0.04)) / 2))
        for (const sx of [-1, 1]) add(box(0.06, 0.08, D + 0.1, std('#5a3a26', 0.5), (sx * (W + 0.04)) / 2, Hh, 0))
        add(box(W * 0.85, Hh - 0.1, D * 0.85, std('#5a3a26', 0.5), 0, (Hh - 0.1) / 2, 0))
        ;['#ffffff', '#c94a3a', '#e8b60f', '#2e2a26', '#4f6f9a'].forEach((col, i) => add(geo(G.sphere, std(col, 0.2), 0.05, 0.05, 0.05, (i - 2) * 0.08, Hh + 0.025, D * 0.2 + (i % 2) * 0.06)))
      } else {
        add(box(W, 0.004, 0.02, white, 0, Hh + 0.002, 0))
        add(box(W + 0.1, 0.15, 0.01, std('#ffffff', 1, { transparent: true, opacity: 0.6 }), 0, Hh + 0.075, 0))
        fourLegs(Hh - 0.04, 0.15, 0.025, metal)
      }
      break
    }
    case 'treadmill':
      add(box(W, 0.15, D, c, 0, 0.075, 0))
      add(box(W * 0.8, 0.01, D * 0.85, std('#111', 0.8), 0, 0.155, 0.05))
      for (const sx of [-1, 1]) add(box(0.04, Hh - 0.15, 0.04, c, (sx * W) / 2 - sx * 0.03, Hh / 2, -D / 2 + 0.1))
      add(box(W, 0.2, 0.15, c, 0, Hh - 0.1, -D / 2 + 0.12))
      add(box(W * 0.5, 0.12, 0.005, std('#1a2230', 0.1, { emissive: new THREE.Color('#5fe0a0'), emissiveIntensity: 0.4 }), 0, Hh - 0.08, -D / 2 + 0.2))
      break
    case 'weights': {
      for (const sx of [-1, 1]) add(box(0.04, Hh, D, c, (sx * W) / 2, Hh / 2, 0))
      for (const y of [Hh * 0.35, Hh * 0.75]) {
        add(box(W, 0.03, D, c, 0, y, 0))
        for (let i = 0; i < 4; i++) {
          const x = -W / 2 + 0.12 + i * (W - 0.24) / 3
          add(geo(G.cylLow, std('#2e2a26', 0.5), 0.09, D * 0.8, 0.09, x, y + 0.06, 0).rotateX(Math.PI / 2))
        }
      }
      break
    }
    case 'punchbag':
      add(cyl(0.006, 0.6, dark, 0, Hh + 0.3, 0, true))
      add(geo(G.cyl, std(f.color, 0.4), W, Hh, D, 0, Hh / 2, 0))
      break
    case 'telescope': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const l = box(0.025, Hh * 0.65, 0.025, dark, Math.cos(a) * W * 0.18, Hh * 0.3, Math.sin(a) * D * 0.18)
        l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3)
        add(l)
      }
      add(geo(G.cyl, c, 0.12, Hh * 0.6, 0.12, 0, Hh * 0.75, 0).rotateX(0.9))
      break
    }
    case 'chandelier': {
      add(cyl(0.006, 0.3, std(f.color, 0.3, { metalness: 0.6 }), 0, Hh + 0.15, 0, true))
      add(geo(G.torus, std(f.color, 0.3, { metalness: 0.6 }), W * 0.8, D * 0.8, 0.25, 0, Hh * 0.3, 0).rotateX(Math.PI / 2))
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const x = Math.cos(a) * W * 0.4
        const z = Math.sin(a) * D * 0.4
        add(cyl(0.012, 0.1, white, x, Hh * 0.3 + 0.05, z))
        add(geo(G.sphere, glowMat('#ffd38a', 2), 0.025, 0.05, 0.025, x, Hh * 0.3 + 0.13, z))
      }
      break
    }
    case 'paperlantern':
      add(cyl(0.004, 0.3, dark, 0, Hh + 0.15, 0, true))
      add(geo(G.sphere, glowMat(f.color, 0.9), W, Hh, D, 0, Hh / 2, 0))
      break
    case 'sconce':
      add(box(0.08, 0.12, 0.02, c, 0, Hh * 0.5, -D / 2 + 0.01))
      add(geo(G.shade, glowMat('#fff2d8', 0.7), W, Hh * 0.6, W, 0, Hh * 0.6, 0))
      break
    case 'lavalamp':
      add(geo(G.cone, std('#c9c9c9', 0.3, { metalness: 0.6 }), W, Hh * 0.3, D, 0, Hh * 0.15, 0).rotateZ(Math.PI))
      add(geo(G.cyl, glowMat(f.color, 1.2), W * 0.6, Hh * 0.55, D * 0.6, 0, Hh * 0.58, 0))
      add(geo(G.sphere, glowMat('#ffd34d', 1.5), W * 0.3, W * 0.4, W * 0.3, 0, Hh * 0.6, 0))
      add(geo(G.cone, std('#c9c9c9', 0.3, { metalness: 0.6 }), W * 0.5, Hh * 0.12, D * 0.5, 0, Hh * 0.92, 0))
      break
    case 'moonlamp':
      add(geo(G.cylLow, wood, W * 0.6, 0.03, D * 0.6, 0, 0.015, 0))
      add(geo(G.blob, glowMat(f.color, 1.1), W, W, W, 0, Hh * 0.55, 0))
      break
    case 'discoball':
      add(cyl(0.004, 0.3, dark, 0, Hh + 0.15, 0, true))
      add(geo(new THREE.IcosahedronGeometry(0.5, 2), std(f.color, 0.05, { metalness: 1, flatShading: true }), W, Hh, D, 0, Hh / 2, 0))
      break
    case 'ceilingfan':
      add(cyl(0.02, 0.2, c, 0, Hh + 0.1, 0, true))
      add(geo(G.cyl, c, 0.18, 0.1, 0.18, 0, Hh * 0.5, 0))
      for (let i = 0; i < 4; i++) add(box(W * 0.45, 0.01, 0.12, c, Math.cos((i * Math.PI) / 2) * W * 0.25, Hh * 0.5, Math.sin((i * Math.PI) / 2) * W * 0.25).rotateY((-i * Math.PI) / 2))
      add(geo(G.sphere, glowMat('#fff2d8', 1), 0.14, 0.1, 0.14, 0, Hh * 0.3, 0))
      break
    case 'xmastree': {
      add(cyl(0.18, 0.25, std('#c8805f', 0.8), 0, 0.125, 0))
      ;[0, 1, 2].forEach((i) => add(geo(G.cone, std(f.color, 0.9, { flatShading: true }), W * (1 - i * 0.27), Hh * 0.38, D * (1 - i * 0.27), 0, Hh * (0.37 + i * 0.2), 0)))
      const cols = ['#ffd38a', '#ff6fa8', '#8fd0ea', '#ffd38a']
      for (let i = 0; i < 18; i++) {
        const t = i / 18
        const y = Hh * (0.25 + t * 0.6)
        const r = W * 0.45 * (1 - t * 0.85)
        const a = i * 2.4
        add(prep(geo(G.sphere, glowMat(cols[i % 4], 1.6), 0.045, 0.045, 0.045, Math.cos(a) * r, y, Math.sin(a) * r), false))
      }
      add(prep(geo(G.blob, glowMat('#ffd34d', 1.5), 0.12, 0.12, 0.04, 0, Hh * 0.98, 0), false))
      break
    }
    case 'streetlamp':
      add(cyl(0.12, 0.3, c, 0, 0.15, 0))
      add(cyl(0.04, Hh - 0.4, c, 0, Hh / 2, 0, true))
      add(box(0.22, 0.3, 0.22, std('#fff3c8', 0.3, { emissive: new THREE.Color('#ffd38a'), emissiveIntensity: 1.2 }), 0, Hh - 0.2, 0))
      add(geo(G.cone, c, 0.34, 0.15, 0.34, 0, Hh - 0.0, 0))
      break
    case 'gardenlights': {
      const n = Math.max(2, Math.round(W / 0.6))
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (i + 0.5) * (W / n)
        add(cyl(0.04, Hh - 0.06, c, x, (Hh - 0.06) / 2, 0, true))
        add(geo(G.cylLow, glowMat('#ffe2a8', 1.6), 0.09, 0.06, 0.09, x, Hh - 0.03, 0))
      }
      break
    }
    case 'pottree':
      pot(W * 0.25, 0.4, '#efe9e0')
      add(cyl(0.03, Hh * 0.5, std('#7a5a40', 0.9), 0, 0.4 + Hh * 0.2, 0, true))
      plantBall(W * 0.45, Hh * 0.72)
      plantBall(W * 0.3, Hh * 0.85, W * 0.12, 0, shade(f.color, 1.1))
      if (f.type === 'lemon') for (let i = 0; i < 6; i++) add(geo(G.sphere, std('#f2d23c', 0.5), 0.07, 0.08, 0.07, Math.cos(i * 1.1) * W * 0.4, Hh * (0.65 + (i % 3) * 0.08), Math.sin(i * 1.1) * W * 0.4))
      break
    case 'sunflower': {
      pot(W * 0.4, 0.25)
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * W * 0.18
        const h = Hh * (0.8 + (i % 2) * 0.2)
        add(cyl(0.01, h - 0.25, std('#5f8a5a', 0.8), x, 0.25 + (h - 0.25) / 2, 0, true))
        add(geo(G.cylLow, std(f.color, 0.8), 0.2, 0.02, 0.2, x, h, 0.04).rotateX(1.2))
        add(geo(G.cylLow, std('#5a3a26', 0.9), 0.09, 0.025, 0.09, x, h + 0.005, 0.05).rotateX(1.2))
      }
      break
    }
    case 'terrarium':
      add(geo(G.sphere, std('#cfe3ee', 0.05, { transparent: true, opacity: 0.35 }), W, Hh, D, 0, Hh / 2, 0))
      add(geo(G.cyl, std('#7a5a40', 1), W * 0.7, 0.04, D * 0.7, 0, 0.04, 0))
      plantBall(W * 0.2, Hh * 0.3, -W * 0.1, 0)
      plantBall(W * 0.15, Hh * 0.25, W * 0.12, 0.03, '#9cc3a0')
      break
    case 'herbs': {
      const n = Math.max(2, Math.round(W / 0.15))
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (i + 0.5) * (W / n)
        add(geo(G.cyl, std(i % 2 ? '#c8805f' : '#efe9e0', 0.8), W / n - 0.02, Hh * 0.45, D, x, Hh * 0.225, 0))
        add(geo(G.blob, std(shade(f.color, 0.9 + (i % 3) * 0.1), 0.9, { flatShading: true }), W / n, Hh * 0.7, D, x, Hh * 0.65, 0))
      }
      break
    }
    case 'bamboo': {
      pot(W * 0.4, 0.3, '#2e2a26')
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05
        const x = Math.cos(a) * W * 0.18
        const z = Math.sin(a) * D * 0.18
        add(cyl(0.012, Hh - 0.3, std('#9cbf6a', 0.6), x, 0.3 + (Hh - 0.3) / 2, z, true))
        add(geo(G.blob, std(f.color, 0.9, { flatShading: true }), 0.18, 0.25, 0.18, x, Hh * (0.7 + (i % 3) * 0.1), z))
      }
      break
    }
    case 'plantladder': {
      for (let i = 0; i < 3; i++) {
        const y = Hh * (0.3 + i * 0.33)
        const z = D / 2 - 0.08 - i * (D - 0.1) / 3
        add(box(W, 0.025, 0.14, c, 0, y, z))
        ;[-0.3, 0.05, 0.3].forEach((t, k) => {
          if ((i + k) % 2) return
          add(geo(G.cyl, std('#c8805f', 0.8), 0.1, 0.1, 0.1, t * W, y + 0.06, z))
          add(geo(G.blob, std(['#7a9a6e', '#5f8a5a', '#9cc3a0'][k], 0.9, { flatShading: true }), 0.16, 0.16, 0.16, t * W, y + 0.16, z))
        })
      }
      for (const sx of [-1, 1]) add(box(0.03, Hh, 0.03, c, (sx * W) / 2, Hh / 2, 0).rotateX(0.3))
      break
    }
    case 'statue':
      add(box(W * 0.8, Hh * 0.45, D * 0.8, std('#e2dbd0', 0.7), 0, Hh * 0.225, 0))
      add(geo(G.blob, std(f.color, 0.5, { flatShading: true }), W * 0.7, Hh * 0.35, D * 0.6, 0, Hh * 0.62, 0))
      add(geo(G.sphere, std(f.color, 0.5), W * 0.45, W * 0.55, W * 0.45, 0, Hh * 0.9, 0))
      break
    case 'gallery': {
      const frames = [[-0.33, 0.25, 0.28, 0.4], [0, 0.3, 0.3, 0.3], [0.33, 0.22, 0.25, 0.35], [-0.18, -0.25, 0.35, 0.3], [0.2, -0.25, 0.3, 0.38]]
      frames.forEach(([fx, fy, fw, fh], i) => {
        add(box(fw * W, fh * Hh * 1.5, D, c, fx * W, Hh / 2 + fy * Hh, 0))
        add(prep(box(fw * W - 0.04, fh * Hh * 1.5 - 0.04, 0.005, std(['#e9c9c4', '#cfe3ee', '#efe2c8', '#dfe6dc', '#e8e3f3'][i], 0.8), fx * W, Hh / 2 + fy * Hh, D / 2 + 0.003), false))
      })
      break
    }
    case 'macrame': {
      add(cyl(0.012, W, wood, 0, Hh, 0, true).rotateZ(Math.PI / 2))
      const n = 9
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + 0.04 + (i * (W - 0.08)) / (n - 1)
        const len = Hh * (0.6 + 0.4 * Math.sin((i / (n - 1)) * Math.PI))
        add(prep(box(0.012, len, 0.012, cSoft, x, Hh - len / 2, 0), false))
      }
      add(prep(geo(G.sphere, cSoft, W * 0.6, Hh * 0.35, 0.03, 0, Hh * 0.65, 0.005), false))
      break
    }
    case 'gifts':
      ;[[-0.2, 0, 0.5, 0.9, 0.6, f.color], [0.22, 0.05, 0.4, 0.6, 0.5, '#7f9db5'], [0, -0.1, 0.3, 1.25, 0.35, '#e8b60f']].forEach(([x, z, s, hk, sd, col]) => {
        const bw = W * (s as number)
        const bh = Hh * (hk as number) * 0.6
        const bx = (x as number) * W
        const bz = (z as number) * D
        const by = col === '#e8b60f' ? Hh * 0.54 : 0
        add(box(bw, bh, D * (sd as number), std(col as string, 0.6), bx, by + bh / 2, bz))
        add(box(bw + 0.005, bh + 0.005, 0.03, std('#ffffff', 0.4), bx, by + bh / 2, bz))
      })
      break
    case 'pumpkin':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        add(geo(G.sphere, std(f.color, 0.6), W * 0.55, Hh, D * 0.55, Math.cos(a) * W * 0.2, Hh / 2, Math.sin(a) * D * 0.2))
      }
      add(cyl(0.015, 0.06, std('#5f6a3a', 0.8), 0, Hh + 0.02, 0, true))
      break
    case 'doghouse':
      add(box(W, Hh * 0.6, D, c, 0, Hh * 0.3, 0))
      roof(W + 0.1, D + 0.1, Hh * 0.6, Hh * 0.4, std('#5b534b', 0.8))
      add(prep(box(W * 0.4, Hh * 0.38, 0.01, std('#1d1714', 1), 0, Hh * 0.2, D / 2 + 0.003), false))
      break
    case 'birdcage': {
      add(geo(G.cyl, c, W, 0.03, D, 0, 0.015, 0))
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        add(prep(cyl(0.003, Hh * 0.7, c, Math.cos(a) * W * 0.48, Hh * 0.35, Math.sin(a) * D * 0.48, true), false))
      }
      add(geo(G.sphere, std(f.color, 0.4, { side: THREE.DoubleSide, transparent: true, opacity: 0.5 }), W, Hh * 0.6, D, 0, Hh * 0.7, 0))
      add(geo(G.sphere, std('#e8b60f', 0.7), 0.06, 0.06, 0.09, 0, Hh * 0.4, 0))
      break
    }
    case 'fishbowl':
      add(geo(G.sphere, std('#9fd8f0', 0.05, { transparent: true, opacity: 0.4, emissive: new THREE.Color('#3aa0d8'), emissiveIntensity: 0.2 }), W, Hh, D, 0, Hh / 2, 0))
      add(geo(G.sphere, std(f.color, 0.4, { emissive: new THREE.Color(f.color), emissiveIntensity: 0.3 }), 0.06, 0.04, 0.025, 0, Hh * 0.5, 0))
      break
    case 'bowls':
      for (const sx of [-1, 1]) add(geo(G.cone, std(sx < 0 ? f.color : '#c98b8b', 0.4), W * 0.45, Hh, D * 0.9, (sx * W) / 4, Hh / 2, 0).rotateZ(Math.PI))
      break
    case 'hedge':
      add(box(W, Hh, D, std(f.color, 0.95), 0, Hh / 2, 0))
      for (let x = -W / 2 + 0.25; x < W / 2; x += 0.5) plantBall(Math.min(D, 0.5) * 0.55, Hh - 0.05, x, 0, shade(f.color, 1.08))
      break
    case 'rosebush':
      plantBall(W * 0.5, Hh * 0.5)
      plantBall(W * 0.35, Hh * 0.7, W * 0.15, 0, shade(f.color, 1.1))
      for (let i = 0; i < 9; i++) add(geo(G.sphere, std(['#e04a6a', '#f2a0c0', '#ffffff'][i % 3], 0.6), 0.07, 0.07, 0.07, Math.cos(i * 2.1) * W * 0.38, Hh * (0.45 + (i % 4) * 0.12), Math.sin(i * 2.1) * D * 0.38))
      break
    case 'lavender': {
      const n = Math.max(3, Math.round(W / 0.25))
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (i + 0.5) * (W / n)
        plantBall(Math.min(W / n, D) * 0.5, Hh * 0.35, x, 0, '#7a9a6e')
        add(geo(G.blob, std(i % 3 === 0 && modelOf(f.type) !== f.type ? '#e9c9c4' : f.color, 0.9, { flatShading: true }), Math.min(W / n, D) * 0.8, Hh * 0.6, D * 0.7, x, Hh * 0.65, 0))
      }
      break
    }
    case 'veggie': {
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
      add(box(W - 0.08, 0.02, D - 0.08, std('#5a4030', 1), 0, Hh, 0))
      for (let i = 0; i < 8; i++) {
        const x = -W / 2 + 0.2 + (i % 4) * (W - 0.4) / 3
        const z = i < 4 ? -D * 0.22 : D * 0.22
        add(geo(G.blob, std(['#5f8a5a', '#8fb07e', '#7a9a6e'][i % 3], 0.9, { flatShading: true }), 0.22, 0.18, 0.22, x, Hh + 0.08, z))
        if (i % 3 === 0) add(geo(G.sphere, std('#c94a3a', 0.4), 0.06, 0.06, 0.06, x + 0.05, Hh + 0.12, z))
      }
      break
    }
    case 'greenhouse': {
      const glass = std('#dff0f5', 0.05, { transparent: true, opacity: 0.25, side: THREE.DoubleSide })
      const wallH = Hh * 0.6
      add(prep(box(W, wallH, D, glass, 0, wallH / 2, 0), false))
      roof(W, D, wallH, Hh - wallH, glass, false)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.04, wallH, 0.04, c, (sx * W) / 2, wallH / 2, (sz * D) / 2))
      for (let x = -W / 2 + 0.3; x < W / 2; x += 0.5) plantBall(0.2, 0.3, x, D * 0.3, '#7a9a6e')
      break
    }
    case 'shed':
      add(box(W, Hh * 0.7, D, c, 0, Hh * 0.35, 0))
      roof(W + 0.2, D + 0.2, Hh * 0.7, Hh * 0.3, std('#5b534b', 0.8))
      add(prep(box(W * 0.35, Hh * 0.6, 0.01, std(shade(f.color, 0.75), 0.8), 0, Hh * 0.3, D / 2 + 0.003), false))
      add(prep(box(W * 0.2, Hh * 0.2, 0.01, std('#cfe3ee', 0.1), W * 0.3, Hh * 0.45, D / 2 + 0.003), false))
      break
    case 'pergola': {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.12, Hh, 0.12, c, (sx * W) / 2 - sx * 0.06, Hh / 2, (sz * D) / 2 - sz * 0.06))
      for (const sz of [-1, 1]) add(box(W, 0.15, 0.08, c, 0, Hh - 0.075, (sz * D) / 2 - sz * 0.06))
      for (let x = -W / 2 + 0.15; x < W / 2; x += 0.35) add(box(0.05, 0.1, D + 0.2, c, x, Hh + 0.05, 0))
      plantBall(0.4, Hh, -W / 2 + 0.2, -D / 2 + 0.2, '#7a9a6e')
      break
    }
    case 'fountain':
      add(geo(G.cyl, c, W, 0.4, D, 0, 0.2, 0))
      add(prep(geo(G.cyl, std('#6fc7e6', 0.05, { emissive: new THREE.Color('#2a9bd0'), emissiveIntensity: 0.25 }), W * 0.9, 0.02, D * 0.9, 0, 0.39, 0), false))
      add(cyl(0.08, Hh - 0.4, c, 0, 0.4 + (Hh - 0.4) / 2, 0))
      add(geo(G.cyl, c, W * 0.4, 0.08, D * 0.4, 0, Hh * 0.8, 0))
      add(geo(G.cone, std('#bfe8f8', 0.05, { transparent: true, opacity: 0.6 }), W * 0.15, 0.3, D * 0.15, 0, Hh + 0.05, 0))
      break
    case 'pond':
      add(prep(geo(G.cylLow, std('#a8a39b', 0.9), W, Hh, D, 0, Hh / 2, 0), false))
      add(prep(geo(G.cylLow, std(f.color, 0.05, { emissive: new THREE.Color('#2a7fa8'), emissiveIntensity: 0.25 }), W * 0.88, Hh + 0.01, D * 0.88, 0, Hh / 2 + 0.005, 0), false))
      for (let i = 0; i < 3; i++) add(prep(geo(G.cylLow, std('#6f9a5e', 0.6), 0.25, 0.01, 0.25, (i - 1) * W * 0.2, Hh + 0.012, (i % 2) * D * 0.15), false))
      break
    case 'rocks':
      ;[[0, 0, 1], [0.32, 0.2, 0.6], [-0.3, 0.15, 0.5]].forEach(([x, z, s]) => add(geo(G.blob, std(f.color, 0.95, { flatShading: true }), W * 0.55 * s, Hh * s * 1.6, D * 0.7 * s, x * W, Hh * s * 0.5, z * D)))
      break
    case 'snowman': {
      const snow = std(f.color, 0.9)
      add(geo(G.sphere, snow, W, W, W, 0, W * 0.45, 0))
      add(geo(G.sphere, snow, W * 0.72, W * 0.72, W * 0.72, 0, W * 1.15, 0))
      add(geo(G.sphere, snow, W * 0.5, W * 0.5, W * 0.5, 0, W * 1.65, 0))
      add(geo(G.cone, std('#e8822e', 0.5), 0.04, 0.12, 0.04, 0, W * 1.65, W * 0.3).rotateX(Math.PI / 2))
      add(geo(G.cyl, std('#2e2a26', 0.6), W * 0.4, 0.2, W * 0.4, 0, Math.min(Hh, W * 1.9 + 0.1), 0))
      add(geo(G.torus, std('#c94a3a', 0.9), W * 0.55, W * 0.55, 1, 0, W * 1.42, 0).rotateX(Math.PI / 2))
      break
    }
    case 'car': {
      const paint = std(f.color, 0.25, { metalness: 0.3 })
      add(box(W, Hh * 0.4, D, paint, 0, 0.18 + Hh * 0.2, 0))
      add(box(W * 0.9, Hh * 0.35, D * 0.5, paint, 0, 0.18 + Hh * 0.55, -D * 0.05))
      const glass = std('#2a3340', 0.05, { transparent: true, opacity: 0.8 })
      add(prep(box(W * 0.91, Hh * 0.25, D * 0.4, glass, 0, 0.18 + Hh * 0.56, -D * 0.05), false))
      for (const sx of [-1, 1])
        for (const sz of [-0.32, 0.32]) add(geo(G.cyl, std('#1d1a18', 0.8), 0.6, 0.2, 0.6, (sx * W) / 2 - sx * 0.08, 0.3, sz * D).rotateZ(Math.PI / 2))
      for (const sx of [-1, 1]) add(prep(box(0.18, 0.08, 0.01, glowMat('#fff2d8', 0.8), sx * W * 0.32, 0.18 + Hh * 0.3, D / 2 + 0.003), false))
      break
    }
    case 'bicycle': {
      const r = Math.min(0.35, Hh * 0.35)
      for (const sz of [-1, 1]) add(geo(G.torus, dark, r * 2, r * 2, 0.25, 0, r, sz * (D / 2 - r)).rotateY(Math.PI / 2))
      add(box(0.03, 0.03, D - r * 2, c, 0, r + 0.15, 0).rotateX(0.15))
      add(box(0.03, Hh * 0.6, 0.03, c, 0, r + Hh * 0.2, -D * 0.12).rotateX(-0.25))
      add(box(0.03, Hh * 0.7, 0.03, c, 0, r + Hh * 0.2, D / 2 - r - 0.05).rotateX(0.25))
      add(box(0.12, 0.04, 0.22, dark, 0, Hh * 0.9, -D * 0.2))
      add(box(0.45, 0.025, 0.025, dark, 0, Hh, D / 2 - r + 0.05))
      break
    }
    case 'mailbox':
      add(box(0.08, Hh * 0.7, 0.08, wood, 0, Hh * 0.35, 0))
      add(box(W, Hh * 0.25, D, c, 0, Hh * 0.82, 0))
      add(geo(G.cyl, c, W, D, Hh * 0.18, 0, Hh * 0.95, 0).rotateX(Math.PI / 2))
      add(box(0.02, 0.15, 0.06, std('#c94a3a', 0.5), W / 2 + 0.01, Hh * 0.95, 0))
      break
    case 'tent':
      roof(W, D, 0, Hh, std(f.color, 0.9, { side: THREE.DoubleSide }))
      add(prep(box(W * 0.3, Hh * 0.5, 0.01, std('#2e2a26', 1), 0, Hh * 0.25, D / 2 + 0.01), false))
      break
    case 'surfboard': {
      const b = geo(G.sphere, std(f.color, 0.3), W, Hh, 0.06, 0, Hh / 2, 0)
      b.rotation.x = -0.15
      add(b)
      add(prep(box(0.02, Hh * 0.9, 0.065, std('#ffffff', 0.4), 0, Hh / 2, 0).rotateX(-0.15), false))
      break
    }
    default:
      add(box(W, Hh, D, c, 0, Hh / 2, 0))
  }

  // ombre de contact (douce, gratuite) pour tout ce qui touche le sol
  const item = catalogItem(f.type)
  const elev = item?.elev ?? 0
  if (elev === 0 && f.h > 2 && !['rug', 'roundrug', 'path', 'pool'].includes(modelOf(f.type))) g.add(contactShadow(W, D))
  g.position.set(f.x * S, elev * S, f.y * S)
  g.rotation.y = (-f.rotation * Math.PI) / 180
  return g
}

/* ---------- scène complète ---------- */
export interface Emitter {
  pos: THREE.Vector3
  color: string
  power: number
  flicker: boolean
  bulb?: boolean
}

export function buildPlanGroup(plan: PlanData, opts: { cutWalls: number | null; quality: Quality }) {
  shadowsOn = opts.quality === 'belle'
  const root = new THREE.Group()
  for (const f of plan.floors) {
    if (f.points.length < 3) continue
    const shape = new THREE.Shape(f.points.map((p) => new THREE.Vector2(p.x * S, p.y * S)))
    const geom = new THREE.ShapeGeometry(shape)
    geom.rotateX(Math.PI / 2)
    const tex = floorTexture(f.material)
    const pos = geom.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / 1.6
      uv[i * 2 + 1] = pos.getZ(i) / 1.6
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const mat = MATERIALS.find((m) => m.id === f.material)
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ map: tex, roughness: mat?.roughness ?? 0.7, side: THREE.DoubleSide }))
    mesh.position.y = 0.001
    mesh.receiveShadow = true
    root.add(mesh)
  }
  for (const w of plan.walls) root.add(wallGroup(w, plan.openings, opts.cutWalls))
  const emitters: Emitter[] = []
  for (const f of plan.furniture) {
    const m = furnitureMesh(f)
    root.add(m)
    const glow = catalogItem(f.type)?.glow
    if (glow) {
      m.updateMatrixWorld()
      const local = new THREE.Vector3(0, glow.y * S * (f.h / (catalogItem(f.type)!.h || 1)), 0)
      if (modelOf(f.type) === 'arclamp') local.set(0, f.h * S - 0.2, (f.d * S) / 2 - 0.12)
      if (modelOf(f.type) === 'fireplace') local.z = (f.d * S) / 2 + 0.1
      emitters.push({ pos: local.applyMatrix4(m.matrixWorld), color: glow.color, power: glow.power, flicker: !!glow.flicker })
    }
  }
  for (const l of plan.lights) emitters.push({ pos: new THREE.Vector3(l.x * S, l.z * S, l.y * S), color: l.color, power: l.intensity, flicker: false, bulb: true })
  // tout est statique : on fige les matrices (moins de calcul à chaque image)
  root.updateMatrixWorld(true)
  root.traverse((o) => (o.matrixAutoUpdate = false))
  return { root, emitters }
}

/** Libère la mémoire graphique d'une scène (sans toucher aux géométries et matériaux partagés). */
export function disposeScene(root: THREE.Object3D) {
  const shared = new Set<unknown>(Object.values(G))
  const cached = new Set<unknown>(matCache.values())
  if (contactMat) cached.add(contactMat)
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !shared.has(o.geometry)) o.geometry.dispose()
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) if (!cached.has(m)) m.dispose()
    }
  })
}

/* ---------- ciel, sol et lumières ---------- */
export const AMBIENCES = {
  jour: { top: '#d6e7f4', bottom: '#fbf5ec', ground: '#f3ece1', hemiSky: '#fff8ee', hemiGround: '#e3d4bf', hemi: 0.9, sunColor: '#fff1dc', sun: 2.2, lamp: 0.6, exposure: 1.12 },
  doree: { top: '#f3c9a0', bottom: '#fbe7cf', ground: '#ead6bf', hemiSky: '#ffd9b0', hemiGround: '#c9a88a', hemi: 0.55, sunColor: '#ffb470', sun: 2.3, lamp: 1, exposure: 1.08 },
  soir: { top: '#2a2540', bottom: '#5a4560', ground: '#4f4252', hemiSky: '#8a90c8', hemiGround: '#3a2f2a', hemi: 0.32, sunColor: '#9fb0ff', sun: 0.25, lamp: 2.2, exposure: 1.15 },
} as const

/** Fond en dégradé (calé sur l'écran, fonctionne en iso comme en vue libre) avec un léger vignettage. */
const skyCache = new Map<string, THREE.Texture>()
export function skyTexture(time: keyof typeof AMBIENCES) {
  if (skyCache.has(time)) return skyCache.get(time)!
  const a = AMBIENCES[time]
  const t = canvasTex(256, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, a.top)
    g.addColorStop(1, a.bottom)
    x.fillStyle = g
    x.fillRect(0, 0, 256, 256)
    const v = x.createRadialGradient(128, 140, 60, 128, 140, 200)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, time === 'soir' ? 'rgba(0,0,0,0.35)' : 'rgba(150,120,90,0.06)')
    x.fillStyle = v
    x.fillRect(0, 0, 256, 256)
  })
  skyCache.set(time, t)
  return t
}

/** Sol extérieur qui se fond doucement dans le ciel (aucun bord visible). */
export function softGround(time: keyof typeof AMBIENCES, center: THREE.Vector3, size: number) {
  const mat = new THREE.MeshStandardMaterial({ color: AMBIENCES[time].ground, roughness: 1, transparent: true })
  const r = size * 2.2
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uR = { value: r }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGp = position.xy;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGp; uniform float uR;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(uR * 0.22, uR * 0.62, length(vGp));')
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(center.x, -0.002, center.z)
  m.receiveShadow = true
  return m
}

export interface LightRig {
  /** à appeler à chaque image si des flammes vacillent */
  tick: (t: number) => void
  animated: boolean
}

export function addLights(scene: THREE.Scene, emitters: Emitter[], amb: RoomPlan['ambience'], center: THREE.Vector3, size: number, quality: Quality): LightRig {
  const time = (amb.time in AMBIENCES ? amb.time : 'jour') as keyof typeof AMBIENCES
  const a = AMBIENCES[time]
  const night = time === 'soir'
  scene.add(new THREE.HemisphereLight(a.hemiSky, a.hemiGround, a.hemi))
  const sun = new THREE.DirectionalLight(a.sunColor, a.sun * amb.sun)
  const low = time === 'doree'
  sun.position.set(center.x + size * 0.9, size * (low ? 0.55 : 1.2), center.z + size * (low ? 0.4 : 0.9))
  sun.target.position.copy(center)
  sun.castShadow = quality === 'belle' && amb.sun > 0.05
  sun.shadow.mapSize.set(1536, 1536)
  const sc = sun.shadow.camera as THREE.OrthographicCamera
  sc.left = sc.bottom = -size * 0.85
  sc.right = sc.top = size * 0.85
  sc.near = 0.1
  sc.far = size * 4
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.025
  sun.shadow.radius = 3
  scene.add(sun, sun.target)

  // vraies lumières : limitées (chaque lumière coûte sur chaque pixel), les autres sont des halos
  const budget = quality === 'belle' ? 6 : 3
  const sorted = [...emitters].sort((x, y) => y.power - x.power)
  const flick: { light?: THREE.PointLight; sprite: THREE.Sprite; base: number; baseS: number; seed: number }[] = []
  const warm = amb.warm * a.lamp
  sorted.forEach((e, i) => {
    let light: THREE.PointLight | undefined
    if (i < budget && warm > 0.02) {
      light = new THREE.PointLight(e.color, e.power * warm * (night ? 1.6 : 0.6), night ? 7 : 4, 1.6)
      light.position.copy(e.pos)
      scene.add(light)
    }
    if (e.bulb) {
      const bulb = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: e.color }))
      bulb.scale.setScalar(0.1)
      bulb.position.copy(e.pos)
      scene.add(bulb)
    }
    // halo : beaucoup plus visible le soir
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), color: e.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: Math.min(1, (night ? 0.75 : low ? 0.35 : 0.18) * amb.warm) }))
    const s = (night ? 1.1 : 0.7) * (0.5 + e.power * 0.6)
    sprite.scale.setScalar(s)
    sprite.position.copy(e.pos)
    scene.add(sprite)
    // flaque de lumière chaude au sol sous la source (le soir)
    if (night && warm > 0.05) {
      const pool = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: halo(), color: e.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.16 * Math.min(1.5, warm / 2) }))
      pool.rotation.x = -Math.PI / 2
      const r = 1.2 + e.power * 1.2
      pool.scale.set(r, r, 1)
      pool.position.set(e.pos.x, 0.012, e.pos.z)
      scene.add(pool)
    }
    if (e.flicker) flick.push({ light, sprite, base: light?.intensity ?? 0, baseS: s, seed: Math.random() * 100 })
  })

  const animated = quality === 'belle' && flick.length > 0 && time !== 'jour'
  return {
    animated,
    tick: (t) => {
      for (const f of flick) {
        const k = 1 + Math.sin(t * 9 + f.seed) * 0.06 + Math.sin(t * 23 + f.seed * 2) * 0.04
        if (f.light) f.light.intensity = f.base * k
        f.sprite.scale.setScalar(f.baseS * k)
      }
    },
  }
}
