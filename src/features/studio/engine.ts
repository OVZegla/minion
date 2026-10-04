import { uid } from '../../db/db'
import { toSvg } from '../pen/bezier'
import { IDENTITY, type Matrix, type RasterLayer, type SDocState, type SLayer, type ShapeLayer, type TextLayer } from './types'

/* =========================================================
   Canevas utilitaires
   ========================================================= */

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}
export const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: false })!

export function cloneCanvas(src: HTMLCanvasElement) {
  const c = makeCanvas(src.width, src.height)
  ctx2d(c).drawImage(src, 0, 0)
  return c
}

export const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y]
export const invert = (m: Matrix): Matrix => {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}
export const apply = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })
export const isIdentity = (m: Matrix) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1

/* =========================================================
   Création de calques
   ========================================================= */

const baseLayer = (name: string) => ({
  id: uid(),
  name,
  visible: true,
  opacity: 1,
  blend: 'source-over' as const,
  locked: false,
  parentId: null,
  mask: null,
  maskEnabled: true,
  matrix: [...IDENTITY] as Matrix,
})

export function newRaster(w: number, h: number, name = 'Calque', fill?: string): RasterLayer {
  const canvas = makeCanvas(w, h)
  if (fill) {
    const c = ctx2d(canvas)
    c.fillStyle = fill
    c.fillRect(0, 0, w, h)
  }
  return { ...baseLayer(name), kind: 'raster', canvas }
}

export function newText(x: number, y: number, props: Partial<TextLayer> = {}): TextLayer {
  return {
    ...baseLayer(props.text?.slice(0, 24) || 'Texte'),
    kind: 'text',
    text: 'Texte',
    font: 'Inter Variable',
    size: 48,
    color: '#000000',
    bold: false,
    italic: false,
    align: 'left',
    lineHeight: 1.2,
    ...props,
    matrix: translate(x, y),
  }
}

export function newShape(props: Partial<ShapeLayer> & { shape: ShapeLayer['shape'] }, x: number, y: number): ShapeLayer {
  const names = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Ligne', polygon: 'Polygone', path: 'Forme' }
  return {
    ...baseLayer(`${names[props.shape]} 1`),
    kind: 'shape',
    w: 100,
    h: 100,
    sides: 6,
    radius: 0,
    path: null,
    fill: '#000000',
    stroke: null,
    strokeWidth: 2,
    ...props,
    matrix: translate(x, y),
  }
}

/* =========================================================
   Rendu
   ========================================================= */

export function fontString(t: TextLayer) {
  return `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '400'} ${t.size}px "${t.font}", sans-serif`
}

/** Dimensions du texte (dans le repère du calque). */
export function measureText(t: TextLayer) {
  const c = ctx2d(scratch())
  c.font = fontString(t)
  const lines = t.text.split('\n')
  const w = Math.max(10, ...lines.map((l) => c.measureText(l).width))
  return { w, h: lines.length * t.size * t.lineHeight, lines }
}

let _scratch: HTMLCanvasElement | null = null
const scratch = () => (_scratch ??= makeCanvas(4, 4))

/** Boîte englobante locale d'un calque (avant sa matrice). */
export function localBounds(l: SLayer, doc: { width: number; height: number }) {
  switch (l.kind) {
    case 'raster':
      return { x: 0, y: 0, w: l.canvas.width, h: l.canvas.height }
    case 'text': {
      const m = measureText(l)
      const x = l.align === 'center' ? -m.w / 2 : l.align === 'right' ? -m.w : 0
      return { x, y: 0, w: m.w, h: m.h }
    }
    case 'shape':
      if (l.shape === 'path' && l.path?.anchors.length) {
        const xs = l.path.anchors.flatMap((a) => [a.x, a.hIn?.x ?? a.x, a.hOut?.x ?? a.x])
        const ys = l.path.anchors.flatMap((a) => [a.y, a.hIn?.y ?? a.y, a.hOut?.y ?? a.y])
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      }
      return { x: Math.min(0, l.w), y: Math.min(0, l.h), w: Math.abs(l.w), h: Math.abs(l.h) }
    case 'group':
      return { x: 0, y: 0, w: doc.width, h: doc.height }
  }
}

/** Contenu réel (pixels non transparents) d'un calque pixel, pour la transformation. */
export function contentBounds(c: HTMLCanvasElement) {
  const { width: w, height: h } = c
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

function shapePath2D(l: ShapeLayer) {
  if (l.shape === 'path') return new Path2D(l.path ? toSvg(l.path) : '')
  const p = new Path2D()
  const { w, h } = l
  if (l.shape === 'rect') {
    if (l.radius > 0) p.roundRect(Math.min(0, w), Math.min(0, h), Math.abs(w), Math.abs(h), Math.min(l.radius, Math.abs(w) / 2, Math.abs(h) / 2))
    else p.rect(Math.min(0, w), Math.min(0, h), Math.abs(w), Math.abs(h))
  } else if (l.shape === 'ellipse') {
    p.ellipse(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
  } else if (l.shape === 'line') {
    p.moveTo(0, 0)
    p.lineTo(w, h)
  } else if (l.shape === 'polygon') {
    const n = Math.max(3, l.sides)
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
      const x = w / 2 + (Math.cos(a) * Math.abs(w)) / 2
      const y = h / 2 + (Math.sin(a) * Math.abs(h)) / 2
      if (i === 0) p.moveTo(x, y)
      else p.lineTo(x, y)
    }
    p.closePath()
  }
  return p
}

/** Dessine le contenu propre d'un calque (sans opacité, fusion ni masque). */
export function drawLayerContent(c: CanvasRenderingContext2D, l: SLayer, extraRaster?: HTMLCanvasElement | null) {
  c.save()
  const m = l.matrix
  c.transform(m[0], m[1], m[2], m[3], m[4], m[5])
  if (l.kind === 'raster') {
    c.drawImage(l.canvas, 0, 0)
    if (extraRaster) c.drawImage(extraRaster, 0, 0)
  } else if (l.kind === 'text') {
    c.font = fontString(l)
    c.fillStyle = l.color
    c.textBaseline = 'top'
    c.textAlign = l.align
    l.text.split('\n').forEach((line, i) => c.fillText(line, 0, i * l.size * l.lineHeight + l.size * (l.lineHeight - 1) * 0.5))
  } else if (l.kind === 'shape') {
    const p = shapePath2D(l)
    if (l.fill && l.shape !== 'line') {
      c.fillStyle = l.fill
      c.fill(p)
    }
    if (l.stroke && l.strokeWidth > 0) {
      c.strokeStyle = l.stroke
      c.lineWidth = l.strokeWidth
      c.lineJoin = 'round'
      c.lineCap = 'round'
      c.stroke(p)
    }
  }
  c.restore()
}

export interface RenderOptions {
  /** remplace temporairement le rendu d'un calque (aperçu d'un trait de pinceau, d'une transformation…) */
  live?: { id: string; draw: (c: CanvasRenderingContext2D) => void }
  hidden?: Set<string>
}

/** Compose tout le document sur `target` (fond transparent). */
export function renderDoc(target: HTMLCanvasElement, doc: SDocState, opts: RenderOptions = {}) {
  const c = ctx2d(target)
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, target.width, target.height)
  renderChildren(c, doc, null, opts)
}

const tmpPool: HTMLCanvasElement[] = []
function borrow(w: number, h: number) {
  const c = tmpPool.pop() ?? makeCanvas(w, h)
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  } else ctx2d(c).clearRect(0, 0, w, h)
  return c
}
const giveBack = (c: HTMLCanvasElement) => tmpPool.push(c)

function renderChildren(c: CanvasRenderingContext2D, doc: SDocState, parentId: string | null, opts: RenderOptions) {
  for (const l of doc.layers) {
    if (l.parentId !== parentId || !l.visible || opts.hidden?.has(l.id)) continue
    const needsIsolation = l.kind === 'group' || (l.mask && l.maskEnabled)
    if (!needsIsolation && l.blend === 'source-over' && l.opacity === 1 && !opts.live) {
      drawLayerContent(c, l)
      continue
    }
    const tmp = borrow(doc.width, doc.height)
    const t = ctx2d(tmp)
    if (l.kind === 'group') renderChildren(t, doc, l.id, opts)
    else if (opts.live?.id === l.id) opts.live.draw(t)
    else drawLayerContent(t, l)
    if (l.mask && l.maskEnabled) {
      t.globalCompositeOperation = 'destination-in'
      t.drawImage(l.mask, 0, 0)
      t.globalCompositeOperation = 'source-over'
    }
    c.save()
    c.globalAlpha = l.opacity
    c.globalCompositeOperation = l.blend
    c.drawImage(tmp, 0, 0)
    c.restore()
    giveBack(tmp)
  }
}

/** Aplatissement (export, miniature, baguette magique sur l'image entière). */
export function flatten(doc: SDocState, background: string | null = null) {
  const out = makeCanvas(doc.width, doc.height)
  const c = ctx2d(out)
  if (background) {
    c.fillStyle = background
    c.fillRect(0, 0, doc.width, doc.height)
  }
  const tmp = makeCanvas(doc.width, doc.height)
  renderDoc(tmp, doc)
  c.drawImage(tmp, 0, 0)
  return out
}

/** Pixellise un calque (texte, forme, ou pixel transformé) en calque pixel de la taille du document. */
export function rasterize(l: SLayer, doc: { width: number; height: number }): RasterLayer {
  const canvas = makeCanvas(doc.width, doc.height)
  drawLayerContent(ctx2d(canvas), l)
  const { id, name, visible, opacity, blend, locked, parentId, mask, maskEnabled } = l
  return { id, name, visible, opacity, blend, locked, parentId, mask, maskEnabled, matrix: [...IDENTITY] as Matrix, kind: 'raster', canvas }
}

/* =========================================================
   Sélection (masque alpha de la taille du document)
   ========================================================= */

export type SelMode = 'new' | 'add' | 'sub' | 'inter'

export function combineSelection(current: HTMLCanvasElement | null, shape: HTMLCanvasElement, mode: SelMode, w: number, h: number) {
  if (mode === 'new' || !current) return shape
  const out = cloneCanvas(current)
  const c = ctx2d(out)
  c.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'sub' ? 'destination-out' : 'destination-in'
  c.drawImage(shape, 0, 0)
  void w
  void h
  return out
}

export function selectionFromPath(w: number, h: number, draw: (p: Path2D) => void, feather = 0) {
  const c = makeCanvas(w, h)
  const x = ctx2d(c)
  const p = new Path2D()
  draw(p)
  if (feather > 0) x.filter = `blur(${feather}px)`
  x.fillStyle = '#000'
  x.fill(p)
  return c
}

export function invertSelection(sel: HTMLCanvasElement | null, w: number, h: number) {
  const out = makeCanvas(w, h)
  const c = ctx2d(out)
  c.fillStyle = '#000'
  c.fillRect(0, 0, w, h)
  if (sel) {
    c.globalCompositeOperation = 'destination-out'
    c.drawImage(sel, 0, 0)
  }
  return out
}

export function isEmptySelection(sel: HTMLCanvasElement) {
  return !contentBounds(sel)
}

/** Contour de la sélection (fourmis) : segments entre pixels sélectionnés et non sélectionnés. */
export function selectionOutline(sel: HTMLCanvasElement, maxCells = 420) {
  const scale = Math.max(1, Math.ceil(Math.max(sel.width, sel.height) / maxCells))
  const w = Math.ceil(sel.width / scale)
  const h = Math.ceil(sel.height / scale)
  const small = makeCanvas(w, h)
  const sc = small.getContext('2d', { willReadFrequently: true })!
  sc.drawImage(sel, 0, 0, w, h)
  const d = sc.getImageData(0, 0, w, h).data
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 127
  let path = ''
  for (let y = 0; y <= h; y++) {
    let run = -1
    for (let x = 0; x <= w; x++) {
      const edge = x < w && on(x, y) !== on(x, y - 1)
      if (edge && run < 0) run = x
      if (!edge && run >= 0) {
        path += `M${run * scale} ${y * scale}H${x * scale}`
        run = -1
      }
    }
  }
  for (let x = 0; x <= w; x++) {
    let run = -1
    for (let y = 0; y <= h; y++) {
      const edge = y < h && on(x, y) !== on(x - 1, y)
      if (edge && run < 0) run = y
      if (!edge && run >= 0) {
        path += `M${x * scale} ${run * scale}V${y * scale}`
        run = -1
      }
    }
  }
  return path
}

/** Baguette magique / pot de peinture : zone de couleur proche, contiguë ou non. */
export function colorRegion(src: HTMLCanvasElement, sx: number, sy: number, tolerance: number, contiguous: boolean) {
  const { width: w, height: h } = src
  const data = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  const out = makeCanvas(w, h)
  const oc = ctx2d(out)
  const img = oc.createImageData(w, h)
  const o = img.data
  sx = Math.floor(sx)
  sy = Math.floor(sy)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out
  const i0 = (sy * w + sx) * 4
  const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3]
  const tol = tolerance * 4
  const near = (i: number) => Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) + Math.abs(data[i + 3] - a0) <= tol
  if (!contiguous) {
    for (let i = 0; i < w * h; i++) if (near(i * 4)) o[i * 4 + 3] = 255
  } else {
    const seen = new Uint8Array(w * h)
    const stack = [sy * w + sx]
    while (stack.length) {
      const p = stack.pop()!
      if (seen[p]) continue
      seen[p] = 1
      if (!near(p * 4)) continue
      o[p * 4 + 3] = 255
      const x = p % w
      const y = (p - x) / w
      if (x > 0) stack.push(p - 1)
      if (x < w - 1) stack.push(p + 1)
      if (y > 0) stack.push(p - w)
      if (y < h - 1) stack.push(p + w)
    }
  }
  oc.putImageData(img, 0, 0)
  return out
}

/* =========================================================
   Réglages et filtres (appliqués aux pixels, dans la sélection)
   ========================================================= */

export type PixelOp = (d: Uint8ClampedArray) => void

export const ops = {
  brightnessContrast: (b: number, ct: number): PixelOp => (d) => {
    const f = (259 * (ct + 255)) / (255 * (259 - ct))
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = f * (d[i + k] + b - 128) + 128
  },
  levels: (inBlack: number, gamma: number, inWhite: number, outBlack = 0, outWhite = 255): PixelOp => {
    const lut = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) {
      const n = Math.min(1, Math.max(0, (v - inBlack) / Math.max(1, inWhite - inBlack)))
      lut[v] = outBlack + Math.pow(n, 1 / gamma) * (outWhite - outBlack)
    }
    return (d) => {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = lut[d[i]]
        d[i + 1] = lut[d[i + 1]]
        d[i + 2] = lut[d[i + 2]]
      }
    }
  },
  curves: (points: { x: number; y: number }[]): PixelOp => {
    const lut = curveLut(points)
    return (d) => {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = lut[d[i]]
        d[i + 1] = lut[d[i + 1]]
        d[i + 2] = lut[d[i + 2]]
      }
    }
  },
  hueSat: (hue: number, sat: number, light: number): PixelOp => (d) => {
    for (let i = 0; i < d.length; i += 4) {
      let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2])
      h = (h + hue / 360 + 1) % 1
      s = Math.min(1, Math.max(0, s * (1 + sat / 100)))
      l = light >= 0 ? l + (1 - l) * (light / 100) : l * (1 + light / 100)
      const [r, g, b] = hslToRgb(h, s, l)
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
    }
  },
  invert: (): PixelOp => (d) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]
      d[i + 1] = 255 - d[i + 1]
      d[i + 2] = 255 - d[i + 2]
    }
  },
  desaturate: (): PixelOp => (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      d[i] = d[i + 1] = d[i + 2] = v
    }
  },
  threshold: (t: number): PixelOp => (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= t ? 255 : 0
      d[i] = d[i + 1] = d[i + 2] = v
    }
  },
  noise: (amount: number): PixelOp => (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amount * 2.55
      d[i] += n
      d[i + 1] += n
      d[i + 2] += n
    }
  },
}

/** Interpolation monotone des points de la courbe → table de correspondance. */
export function curveLut(points: { x: number; y: number }[]) {
  const pts = [...points].sort((a, b) => a.x - b.x)
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    let j = pts.findIndex((p) => p.x >= v)
    if (j <= 0) {
      lut[v] = j === 0 ? pts[0].y : pts[pts.length - 1].y
      continue
    }
    const a = pts[j - 1]
    const b = pts[j]
    const t = (v - a.x) / Math.max(1, b.x - a.x)
    const s = t * t * (3 - 2 * t) // lissage doux entre deux points
    lut[v] = a.y + (b.y - a.y) * (0.5 * t + 0.5 * s)
  }
  return lut
}

/** Applique une opération aux pixels d'un calque, seulement dans la sélection. Renvoie un nouveau canevas. */
export function applyOp(src: HTMLCanvasElement, op: PixelOp, selection: HTMLCanvasElement | null, layerMatrix: Matrix = IDENTITY) {
  const out = cloneCanvas(src)
  const c = out.getContext('2d', { willReadFrequently: true })!
  const img = c.getImageData(0, 0, out.width, out.height)
  op(img.data)
  const processed = makeCanvas(out.width, out.height)
  ctx2d(processed).putImageData(img, 0, 0)
  return clipToSelection(src, processed, selection, layerMatrix)
}

/** Filtre CSS (flou…) appliqué au calque, dans la sélection. */
export function applyFilter(src: HTMLCanvasElement, filter: string, selection: HTMLCanvasElement | null, layerMatrix: Matrix = IDENTITY) {
  const processed = makeCanvas(src.width, src.height)
  const c = ctx2d(processed)
  c.filter = filter
  c.drawImage(src, 0, 0)
  return clipToSelection(src, processed, selection, layerMatrix)
}

export function sharpen(src: HTMLCanvasElement, amount: number, selection: HTMLCanvasElement | null, layerMatrix: Matrix = IDENTITY) {
  const { width: w, height: h } = src
  const sc = src.getContext('2d', { willReadFrequently: true })!
  const s = sc.getImageData(0, 0, w, h).data
  const out = new ImageData(w, h)
  const o = out.data
  const k = amount
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        const c0 = s[i + ch]
        const n = (y > 0 ? s[i - w * 4 + ch] : c0) + (y < h - 1 ? s[i + w * 4 + ch] : c0) + (x > 0 ? s[i - 4 + ch] : c0) + (x < w - 1 ? s[i + 4 + ch] : c0)
        o[i + ch] = c0 * (1 + 4 * k) - n * k
      }
      o[i + 3] = s[i + 3]
    }
  const processed = makeCanvas(w, h)
  ctx2d(processed).putImageData(out, 0, 0)
  return clipToSelection(src, processed, selection, layerMatrix)
}

/** Mélange : résultat dans la sélection, original ailleurs. */
function clipToSelection(original: HTMLCanvasElement, processed: HTMLCanvasElement, selection: HTMLCanvasElement | null, layerMatrix: Matrix) {
  if (!selection) return processed
  const out = cloneCanvas(original)
  const c = ctx2d(out)
  // sélection exprimée dans le repère du calque
  const selLocal = makeCanvas(out.width, out.height)
  const sl = ctx2d(selLocal)
  const inv = invert(layerMatrix)
  sl.setTransform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5])
  sl.drawImage(selection, 0, 0)
  c.globalCompositeOperation = 'destination-out'
  c.drawImage(selLocal, 0, 0)
  const p = cloneCanvas(processed)
  const pc = ctx2d(p)
  pc.globalCompositeOperation = 'destination-in'
  pc.drawImage(selLocal, 0, 0)
  c.globalCompositeOperation = 'source-over'
  c.drawImage(p, 0, 0)
  return out
}

/* =========================================================
   Couleurs
   ========================================================= */

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h /= 6
  return [h, s, l]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

export const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
export function parseHex(h: string): [number, number, number] {
  const m = h.replace('#', '')
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0]
}
export function hsvToHex(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h * 6) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return hex(f(5) * 255, f(3) * 255, f(1) * 255)
}
export function hexToHsv(h: string): [number, number, number] {
  const [r, g, b] = parseHex(h).map((x) => x / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let hh = 0
  if (d) hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  hh = ((hh / 6) + 1) % 1
  return [hh, max ? d / max : 0, max]
}

/* =========================================================
   Sérialisation (projet rééditable)
   ========================================================= */

export const canvasToBlob = (c: HTMLCanvasElement, type = 'image/png', q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), type, q))

export async function blobToCanvas(b: Blob) {
  const bmp = await createImageBitmap(b)
  const c = makeCanvas(bmp.width, bmp.height)
  ctx2d(c).drawImage(bmp, 0, 0)
  return c
}
