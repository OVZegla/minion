import * as THREE from 'three'
import { MATERIALS } from './catalog'
import { wallAngle, wallLength } from './geometry'
import type { Furniture, Opening, PlanData, RoomPlan, Wall } from './types'

/** La 3D est générée à partir du plan : mêmes murs, ouvertures et meubles, même disposition. */

const S = 0.01 // cm → m

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

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}
function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/* ---------- textures de sol procédurales ---------- */
const texCache = new Map<string, THREE.Texture>()
function floorTexture(materialId: string) {
  const mat = MATERIALS.find((m) => m.id === materialId) ?? MATERIALS[0]
  if (texCache.has(mat.id)) return texCache.get(mat.id)!
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const x = c.getContext('2d')!
  const base = new THREE.Color(mat.color)
  const shade = (k: number) => '#' + base.clone().multiplyScalar(k).getHexString()
  x.fillStyle = mat.color
  x.fillRect(0, 0, 512, 512)
  if (mat.pattern === 'planks') {
    for (let row = 0; row < 8; row++) {
      let off = (row * 157) % 512
      for (let k = -1; k < 3; k++) {
        x.fillStyle = shade(0.9 + ((row * 7 + k * 3) % 5) * 0.035)
        x.fillRect(off + k * 300 - 300, row * 64, 296, 62)
      }
      x.fillStyle = shade(0.75)
      x.fillRect(0, row * 64 + 62, 512, 2)
      off += 0
    }
  } else if (mat.pattern === 'tiles') {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        x.fillStyle = shade(0.95 + ((i + j * 3) % 4) * 0.02)
        x.fillRect(i * 128 + 2, j * 128 + 2, 124, 124)
      }
  } else if (mat.pattern === 'herringbone') {
    x.save()
    for (let i = -8; i < 16; i++)
      for (let j = -8; j < 16; j++) {
        x.save()
        x.translate(i * 64, j * 64 + (i % 2) * 32)
        x.rotate(((i + j) % 2 ? 1 : -1) * (Math.PI / 4))
        x.fillStyle = shade(0.88 + ((i * 3 + j) % 5) * 0.03)
        x.fillRect(0, 0, 88, 22)
        x.restore()
      }
    x.restore()
  } else {
    for (let i = 0; i < 2500; i++) {
      x.fillStyle = shade(0.94 + Math.random() * 0.1)
      x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  texCache.set(mat.id, t)
  return t
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
    // menuiseries
    const ow = o.e - s
    const cx = (s + o.e) / 2
    if (o.kind === 'window' && bottom < H) {
      const visTop = Math.min(top, H)
      const glass = new THREE.Mesh(new THREE.BoxGeometry(ow, visTop - bottom, 0.01), std('#cfe3ee', 0.05, { transparent: true, opacity: 0.35 }))
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
  // la ligne de base du mur est son axe : on le place et on l'oriente
  g.position.set(w.a.x * S, 0, w.a.y * S)
  g.rotation.y = -wallAngle(w)
  return g
}

/* ---------- meubles ---------- */
export function furnitureMesh(f: Furniture) {
  const g = new THREE.Group()
  const W = f.w * S
  const D = f.d * S
  const Hh = f.h * S
  const c = std(f.color, 0.75)
  const wood = std('#b08a64', 0.6)
  const dark = std('#3a332d', 0.6)
  const white = std('#ffffff', 0.35)
  const leg = (x: number, z: number, h: number, r = 0.02, m: THREE.Material = dark) => g.add(cyl(r, r, h, m, x, h / 2, z, 10))
  switch (f.type) {
    case 'sofa':
    case 'armchair': {
      const armW = Math.min(0.18, W * 0.15)
      g.add(box(W, 0.12, D, dark, 0, 0.1, 0))
      g.add(box(W - armW * 2, 0.16, D * 0.75, c, 0, 0.32, D * 0.1))
      g.add(box(W, Hh - 0.12, D * 0.25, c, 0, 0.12 + (Hh - 0.12) / 2, -D / 2 + D * 0.125))
      g.add(box(armW, Hh * 0.7, D, c, -W / 2 + armW / 2, 0.12 + Hh * 0.35, 0))
      g.add(box(armW, Hh * 0.7, D, c, W / 2 - armW / 2, 0.12 + Hh * 0.35, 0))
      break
    }
    case 'coffee':
    case 'table':
    case 'desk': {
      g.add(box(W, 0.04, D, c, 0, Hh - 0.02, 0))
      const ix = W / 2 - 0.06
      const iz = D / 2 - 0.06
      ;[[-ix, -iz], [ix, -iz], [ix, iz], [-ix, iz]].forEach(([x, z]) => leg(x, z, Hh - 0.04, 0.022, f.type === 'desk' ? dark : wood))
      break
    }
    case 'chair':
    case 'officechair': {
      g.add(box(W, 0.05, D, c, 0, 0.46, 0))
      g.add(box(W, Hh - 0.48, 0.04, c, 0, 0.48 + (Hh - 0.48) / 2, -D / 2 + 0.02))
      if (f.type === 'officechair') {
        g.add(cyl(0.03, 0.03, 0.4, dark, 0, 0.22, 0))
        g.add(cyl(0.28, 0.28, 0.03, dark, 0, 0.03, 0))
      } else [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => leg((sx * W) / 2 * 0.85, (sz * D) / 2 * 0.85, 0.44, 0.015))
      break
    }
    case 'bed':
    case 'bedsingle': {
      g.add(box(W, 0.25, D, wood, 0, 0.125, 0))
      g.add(box(W - 0.04, 0.2, D - 0.04, white, 0, 0.35, 0))
      g.add(box(W - 0.02, 0.06, D * 0.68, c, 0, 0.48, D * 0.15))
      g.add(box(W, 0.9, 0.06, wood, 0, 0.45, -D / 2 + 0.03))
      const pw = f.type === 'bed' ? W / 2 - 0.08 : W - 0.12
      ;(f.type === 'bed' ? [-W / 4, W / 4] : [0]).forEach((x) => g.add(box(pw, 0.1, 0.4, white, x, 0.5, -D / 2 + 0.3)))
      break
    }
    case 'rug':
      g.add(box(W, 0.01, D, c, 0, 0.005, 0))
      break
    case 'plant': {
      g.add(cyl(W * 0.3, W * 0.24, 0.35, std('#c8805f', 0.8), 0, 0.175, 0))
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(W * 0.55, 1), std(f.color, 0.85, { flatShading: true }))
      leaves.position.y = 0.35 + (Hh - 0.35) * 0.55
      leaves.scale.y = (Hh - 0.35) / (W * 0.9)
      leaves.castShadow = true
      g.add(leaves)
      break
    }
    case 'lamp': {
      g.add(cyl(0.14, 0.16, 0.03, dark, 0, 0.015, 0))
      g.add(cyl(0.012, 0.012, Hh - 0.3, dark, 0, (Hh - 0.3) / 2, 0))
      g.add(cyl(0.12, 0.2, 0.3, std(f.color, 0.6, { emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.35 }), 0, Hh - 0.15, 0))
      break
    }
    case 'shelf': {
      const T = 0.025
      g.add(box(T, Hh, D, c, -W / 2 + T / 2, Hh / 2, 0))
      g.add(box(T, Hh, D, c, W / 2 - T / 2, Hh / 2, 0))
      for (let i = 0; i <= 4; i++) g.add(box(W, T, D, c, 0, (i * (Hh - T)) / 4 + T / 2, 0))
      break
    }
    case 'tvunit': {
      g.add(box(W, Hh, D, c, 0, Hh / 2, 0))
      g.add(box(W * 0.75, 0.5, 0.04, dark, 0, Hh + 0.3, 0))
      break
    }
    case 'wardrobe':
    case 'dresser':
    case 'nightstand': {
      g.add(box(W, Hh, D, c, 0, Hh / 2, 0))
      const lines = f.type === 'wardrobe' ? 1 : f.type === 'dresser' ? 2 : 1
      for (let i = 1; i <= lines; i++) {
        if (f.type === 'wardrobe') g.add(box(0.008, Hh - 0.1, 0.01, dark, 0, Hh / 2, D / 2 + 0.001))
        else g.add(box(W - 0.06, 0.008, 0.01, dark, 0, (Hh * i) / (lines + 1), D / 2 + 0.001))
      }
      break
    }
    case 'counter':
    case 'island': {
      g.add(box(W, Hh - 0.04, D, c, 0, (Hh - 0.04) / 2, 0))
      g.add(box(W + 0.02, 0.04, D + 0.02, std('#d8d2c8', 0.4), 0, Hh - 0.02, 0))
      break
    }
    case 'fridge':
      g.add(box(W, Hh, D, std(f.color, 0.3), 0, Hh / 2, 0))
      g.add(box(0.02, 0.4, 0.03, dark, W / 2 - 0.08, Hh * 0.7, D / 2 + 0.015))
      break
    case 'bathtub': {
      g.add(box(W, Hh, D, white, 0, Hh / 2, 0))
      g.add(box(W - 0.12, 0.02, D - 0.12, std('#dfe8ef', 0.2), 0, Hh + 0.001, 0))
      break
    }
    case 'shower': {
      g.add(box(W, 0.06, D, white, 0, 0.03, 0))
      const glass = std('#cfe3ee', 0.05, { transparent: true, opacity: 0.3 })
      g.add(box(W, Hh, 0.01, glass, 0, Hh / 2, D / 2))
      g.add(box(0.01, Hh, D, glass, W / 2, Hh / 2, 0))
      break
    }
    case 'sink':
      g.add(box(W, Hh - 0.15, D, std('#ece6dc', 0.6), 0, (Hh - 0.15) / 2, 0))
      g.add(box(W, 0.15, D, white, 0, Hh - 0.075, 0))
      break
    case 'wc':
      g.add(box(W, 0.4, D * 0.7, white, 0, 0.2, D * 0.12))
      g.add(box(W, 0.4, 0.18, white, 0, 0.6, -D / 2 + 0.09))
      break
    case 'piano': {
      g.add(box(W, 0.12, D, c, 0, Hh - 0.06, 0))
      g.add(box(W * 0.92, 0.02, D * 0.4, white, 0, Hh + 0.01, D * 0.15))
      leg(-W / 2 + 0.05, 0, Hh - 0.12, 0.02)
      leg(W / 2 - 0.05, 0, Hh - 0.12, 0.02)
      break
    }
    default:
      g.add(box(W, Hh, D, c, 0, Hh / 2, 0))
  }
  g.position.set(f.x * S, 0, f.y * S)
  g.rotation.y = (-f.rotation * Math.PI) / 180
  return g
}

/* ---------- scène complète ---------- */
export function buildPlanGroup(plan: PlanData, opts: { cutWalls: number | null }) {
  const root = new THREE.Group()
  for (const f of plan.floors) {
    if (f.points.length < 3) continue
    const shape = new THREE.Shape(f.points.map((p) => new THREE.Vector2(p.x * S, p.y * S)))
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(Math.PI / 2)
    const tex = floorTexture(f.material).clone()
    tex.needsUpdate = true
    tex.repeat.set(1, 1)
    // UV en mètres : un motif ≈ 1,6 m
    const pos = geo.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / 1.6
      uv[i * 2 + 1] = pos.getZ(i) / 1.6
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const mat = MATERIALS.find((m) => m.id === f.material)
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: mat?.roughness ?? 0.7, side: THREE.DoubleSide }))
    mesh.position.y = 0.001
    mesh.receiveShadow = true
    root.add(mesh)
  }
  for (const w of plan.walls) root.add(wallGroup(w, plan.openings, opts.cutWalls))
  for (const f of plan.furniture) root.add(furnitureMesh(f))
  return root
}

export function addLights(scene: THREE.Scene, plan: PlanData, amb: RoomPlan['ambience'], center: THREE.Vector3, size: number) {
  const evening = amb.time === 'soir'
  scene.add(new THREE.HemisphereLight(evening ? '#8a90b8' : '#fff6ea', evening ? '#3a2f2a' : '#d9c8b0', evening ? 0.35 : 0.9))
  const sun = new THREE.DirectionalLight(evening ? '#ffb27a' : '#fff1dc', (evening ? 0.4 : 1.6) * amb.sun)
  sun.position.set(center.x + size * 0.6, size * 1.2, center.z + size * 0.9)
  sun.target.position.copy(center)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera as THREE.OrthographicCamera
  sc.left = sc.bottom = -size
  sc.right = sc.top = size
  sc.near = 0.1
  sc.far = size * 4
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)
  for (const l of plan.lights) {
    const p = new THREE.PointLight(l.color, l.intensity * (evening ? 3.2 : 1.2) * amb.warm, 8, 1.6)
    p.position.set(l.x * S, l.z * S, l.y * S)
    p.castShadow = evening
    p.shadow.mapSize.set(512, 512)
    scene.add(p)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: l.color }))
    bulb.position.copy(p.position)
    scene.add(bulb)
  }
}
