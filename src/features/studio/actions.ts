import { uid } from '../../db/db'
import {
  apply,
  cloneCanvas,
  contentBounds,
  ctx2d,
  invert,
  invertSelection,
  isIdentity,
  localBounds,
  makeCanvas,
  newRaster,
  rasterize,
} from './engine'
import { activeLayer, type StudioStore } from './store'
import { IDENTITY, type GroupLayer, type Matrix, type RasterLayer, type SDocState, type SLayer } from './types'

/* ---------- utilitaires ---------- */

export const replaceLayer = (s: SDocState, l: SLayer): SDocState => ({ ...s, layers: s.layers.map((x) => (x.id === l.id ? l : x)) })

function uniqueName(s: SDocState, base: string) {
  let n = s.layers.length + 1
  const names = new Set(s.layers.map((l) => l.name))
  while (names.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** Insère un calque juste au-dessus du calque actif (comme Photoshop). */
export function insertAbove(s: SDocState, l: SLayer): SDocState {
  const act = activeLayer(s)
  const idx = act ? s.layers.indexOf(act) : s.layers.length - 1
  const parentId = act ? (act.kind === 'group' ? act.id : act.parentId) : null
  const layer = { ...l, parentId } as SLayer
  const layers = [...s.layers]
  layers.splice(idx + 1, 0, layer)
  return { ...s, layers, activeId: layer.id, editMask: false }
}

/** Calque pixel modifiable (identité). Renvoie aussi l'état éventuellement modifié (pixellisation). */
export function editableRaster(s: SDocState): { state: SDocState; layer: RasterLayer } | null {
  const l = activeLayer(s)
  if (!l || l.kind === 'group' || l.locked) return null
  if (l.kind === 'raster' && isIdentity(l.matrix) && l.matrix[4] === 0 && l.matrix[5] === 0 && l.canvas.width === s.width && l.canvas.height === s.height) return { state: s, layer: l }
  const r = rasterize(l, s)
  return { state: replaceLayer(s, r), layer: r }
}

export const needsRasterize = (s: SDocState) => {
  const l = activeLayer(s)
  return !!l && (l.kind === 'text' || l.kind === 'shape')
}

/* ---------- calques ---------- */

export const actions = {
  newLayer(store: StudioStore) {
    const s = store.state
    store.commit('Nouveau calque', insertAbove(s, newRaster(s.width, s.height, uniqueName(s, 'Calque'))))
  },

  duplicate(store: StudioStore) {
    const s = store.state
    const l = activeLayer(s)
    if (!l) return
    // avec une sélection sur un calque pixel : « Calque par copier » (Ctrl+J)
    if (s.selection && l.kind === 'raster') {
      const r = editableRaster(s)
      if (!r) return
      const c = cloneCanvas(r.layer.canvas)
      const x = ctx2d(c)
      x.globalCompositeOperation = 'destination-in'
      x.drawImage(s.selection, 0, 0)
      const nl: RasterLayer = { ...newRaster(s.width, s.height, `${l.name} copie`), canvas: c }
      store.commit('Calque par copier', insertAbove({ ...r.state, selection: null }, nl))
      return
    }
    const copy = { ...l, id: uid(), name: `${l.name} copie`, ...(l.kind === 'raster' ? { canvas: cloneCanvas(l.canvas) } : {}), mask: l.mask ? cloneCanvas(l.mask) : null } as SLayer
    const layers = [...s.layers]
    layers.splice(s.layers.indexOf(l) + 1, 0, copy)
    store.commit('Dupliquer le calque', { ...s, layers, activeId: copy.id })
  },

  remove(store: StudioStore) {
    const s = store.state
    const l = activeLayer(s)
    if (!l) return
    const toRemove = new Set([l.id, ...descendants(s, l.id)])
    const layers = s.layers.filter((x) => !toRemove.has(x.id))
    const idx = Math.max(0, s.layers.indexOf(l) - 1)
    store.commit('Supprimer le calque', { ...s, layers, activeId: layers[Math.min(idx, layers.length - 1)]?.id ?? null })
  },

  group(store: StudioStore) {
    const s = store.state
    const l = activeLayer(s)
    if (!l) return
    const g: GroupLayer = { id: uid(), name: uniqueName(s, 'Groupe'), kind: 'group', visible: true, opacity: 1, blend: 'source-over', locked: false, parentId: l.parentId, mask: null, maskEnabled: true, matrix: [...IDENTITY] as Matrix, collapsed: false }
    const layers = s.layers.map((x) => (x.id === l.id ? { ...x, parentId: g.id } : x)) as SLayer[]
    layers.splice(layers.findIndex((x) => x.id === l.id) + 1, 0, g)
    store.commit('Grouper les calques', { ...s, layers, activeId: g.id })
  },

  ungroup(store: StudioStore) {
    const s = store.state
    const g = activeLayer(s)
    if (!g || g.kind !== 'group') return
    const layers = s.layers.filter((x) => x.id !== g.id).map((x) => (x.parentId === g.id ? { ...x, parentId: g.parentId } : x)) as SLayer[]
    store.commit('Dissocier les calques', { ...s, layers, activeId: layers.find((x) => x.parentId === g.parentId)?.id ?? null })
  },

  /** Ordre : +1 = vers le haut (Ctrl+]), −1 = vers le bas (Ctrl+[). */
  move(store: StudioStore, dir: 1 | -1) {
    const s = store.state
    const l = activeLayer(s)
    if (!l) return
    const siblings = s.layers.filter((x) => x.parentId === l.parentId)
    const i = siblings.indexOf(l)
    const other = siblings[i + dir]
    if (!other) return
    const layers = [...s.layers]
    const a = layers.indexOf(l)
    const b = layers.indexOf(other)
    ;[layers[a], layers[b]] = [layers[b], layers[a]]
    store.commit(dir > 0 ? 'Avancer' : 'Reculer', { ...s, layers })
  },

  /** Réorganise par glisser-déposer dans le panneau Calques. */
  reorder(store: StudioStore, id: string, beforeId: string | null, parentId: string | null) {
    const s = store.state
    const l = s.layers.find((x) => x.id === id)
    if (!l || id === beforeId || (parentId && descendants(s, id).includes(parentId)) || parentId === id) return
    const rest = s.layers.filter((x) => x.id !== id)
    const moved = { ...l, parentId } as SLayer
    // « beforeId » est le calque affiché au-dessus dans le panneau → inséré juste sous lui dans l'ordre de rendu
    const idx = beforeId ? rest.findIndex((x) => x.id === beforeId) : rest.length
    rest.splice(Math.max(0, idx), 0, moved)
    store.commit('Déplacer le calque', { ...s, layers: rest })
  },

  mergeDown(store: StudioStore) {
    const s = store.state
    const l = activeLayer(s)
    if (!l || l.kind === 'group') return
    const siblings = s.layers.filter((x) => x.parentId === l.parentId)
    const below = siblings[siblings.indexOf(l) - 1]
    if (!below || below.kind === 'group') return
    const base = rasterize(below, s)
    const c = cloneCanvas(base.canvas)
    const x = ctx2d(c)
    const top = rasterize(l, s)
    const tmp = cloneCanvas(top.canvas)
    if (l.mask && l.maskEnabled) {
      const tc = ctx2d(tmp)
      tc.globalCompositeOperation = 'destination-in'
      tc.drawImage(l.mask, 0, 0)
    }
    x.globalAlpha = l.opacity
    x.globalCompositeOperation = l.blend
    x.drawImage(tmp, 0, 0)
    const merged: RasterLayer = { ...base, canvas: c }
    store.commit('Fusionner avec le calque inférieur', { ...s, layers: s.layers.filter((y) => y.id !== l.id).map((y) => (y.id === below.id ? merged : y)), activeId: below.id })
  },

  flattenImage(store: StudioStore) {
    const s = store.state
    const c = makeCanvas(s.width, s.height)
    const tmp = makeCanvas(s.width, s.height)
    import('./engine').then(({ renderDoc }) => {
      renderDoc(tmp, s)
      const x = ctx2d(c)
      x.fillStyle = '#ffffff'
      x.fillRect(0, 0, s.width, s.height)
      x.drawImage(tmp, 0, 0)
      const l: RasterLayer = { ...newRaster(s.width, s.height, 'Arrière-plan'), canvas: c }
      store.commit('Aplatir l’image', { ...s, layers: [l], activeId: l.id, selection: null })
    })
  },

  rasterizeActive(store: StudioStore) {
    const s = store.state
    const l = activeLayer(s)
    if (!l || l.kind === 'group') return
    store.commit('Pixelliser le calque', replaceLayer(s, rasterize(l, s)))
  },

  addMask(store: StudioStore, fromSelection: boolean) {
    const s = store.state
    const l = activeLayer(s)
    if (!l) return
    const m = makeCanvas(s.width, s.height)
    const x = ctx2d(m)
    if (fromSelection && s.selection) x.drawImage(s.selection, 0, 0)
    else {
      x.fillStyle = '#000'
      x.fillRect(0, 0, s.width, s.height)
    }
    store.commit('Ajouter un masque de fusion', { ...replaceLayer(s, { ...l, mask: m, maskEnabled: true } as SLayer), editMask: true, selection: fromSelection ? null : s.selection })
  },

  removeMask(store: StudioStore) {
    const s = store.state
    const l = activeLayer(s)
    if (!l?.mask) return
    store.commit('Supprimer le masque', { ...replaceLayer(s, { ...l, mask: null } as SLayer), editMask: false })
  },

  /* ---------- sélection ---------- */
  selectAll(store: StudioStore) {
    const s = store.state
    const c = makeCanvas(s.width, s.height)
    const x = ctx2d(c)
    x.fillStyle = '#000'
    x.fillRect(0, 0, s.width, s.height)
    store.commit('Tout sélectionner', { ...s, selection: c })
  },
  deselect(store: StudioStore) {
    if (!store.state.selection) return
    store.commit('Désélectionner', { ...store.state, selection: null })
  },
  invertSel(store: StudioStore) {
    const s = store.state
    store.commit('Intervertir', { ...s, selection: invertSelection(s.selection, s.width, s.height) })
  },
  /** Ctrl + clic sur la vignette : sélection d'après les pixels du calque. */
  selectionFromLayer(store: StudioStore, id: string) {
    const s = store.state
    const l = s.layers.find((x) => x.id === id)
    if (!l || l.kind === 'group') return
    const c = rasterize(l, s).canvas
    store.commit('Charger la sélection', { ...s, selection: c })
  },

  /** Suppr : efface les pixels sélectionnés. */
  clear(store: StudioStore) {
    const s = store.state
    if (!s.selection) return
    if (s.editMask) return actions.fillMask(store, '#000000')
    const r = editableRaster(s)
    if (!r) return
    const c = cloneCanvas(r.layer.canvas)
    const x = ctx2d(c)
    x.globalCompositeOperation = 'destination-out'
    x.drawImage(s.selection, 0, 0)
    store.commit('Effacer', replaceLayer(r.state, { ...r.layer, canvas: c }))
  },

  /** Alt+Retour arrière (premier plan) / Ctrl+Retour arrière (arrière-plan). */
  fill(store: StudioStore, color: string) {
    const s = store.state
    if (s.editMask) return actions.fillMask(store, color)
    const r = editableRaster(s)
    if (!r) return
    const c = cloneCanvas(r.layer.canvas)
    const x = ctx2d(c)
    const f = makeCanvas(s.width, s.height)
    const fx = ctx2d(f)
    fx.fillStyle = color
    fx.fillRect(0, 0, s.width, s.height)
    if (s.selection) {
      fx.globalCompositeOperation = 'destination-in'
      fx.drawImage(s.selection, 0, 0)
    }
    x.drawImage(f, 0, 0)
    store.commit('Remplir', replaceLayer(r.state, { ...r.layer, canvas: c }))
  },

  fillMask(store: StudioStore, color: string) {
    const s = store.state
    const l = activeLayer(s)
    if (!l?.mask) return
    const m = cloneCanvas(l.mask)
    const x = ctx2d(m)
    const g = gray(color)
    if (s.selection) {
      const f = makeCanvas(s.width, s.height)
      const fx = ctx2d(f)
      fx.globalAlpha = 1
      fx.fillStyle = '#000'
      fx.fillRect(0, 0, s.width, s.height)
      fx.globalCompositeOperation = 'destination-in'
      fx.drawImage(s.selection, 0, 0)
      x.globalCompositeOperation = 'destination-out'
      x.drawImage(f, 0, 0)
      x.globalCompositeOperation = 'source-over'
      x.globalAlpha = g
      x.drawImage(f, 0, 0)
    } else {
      x.clearRect(0, 0, s.width, s.height)
      x.globalAlpha = g
      x.fillStyle = '#000'
      x.fillRect(0, 0, s.width, s.height)
    }
    store.commit('Remplir le masque', replaceLayer(s, { ...l, mask: m } as SLayer))
  },

  /* ---------- image ---------- */
  cropTo(store: StudioStore, rect: { x: number; y: number; w: number; h: number }) {
    const s = store.state
    const r = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.max(1, Math.round(rect.w)), h: Math.max(1, Math.round(rect.h)) }
    const shift: Matrix = [1, 0, 0, 1, -r.x, -r.y]
    const layers = s.layers.map((l) => {
      const mask = l.mask ? cropCanvas(l.mask, r) : null
      if (l.kind === 'raster' && isIdentity(l.matrix) && l.matrix[4] === 0 && l.matrix[5] === 0 && l.canvas.width === s.width) return { ...l, canvas: cropCanvas(l.canvas, r), mask }
      return { ...l, matrix: [l.matrix[0], l.matrix[1], l.matrix[2], l.matrix[3], l.matrix[4] + shift[4], l.matrix[5] + shift[5]] as Matrix, mask }
    }) as SLayer[]
    store.commit('Recadrer', { ...s, width: r.w, height: r.h, layers, selection: null })
  },

  /** Taille de l'image (rééchantillonnage de tout le document). */
  imageSize(store: StudioStore, w: number, h: number) {
    const s = store.state
    const sx = w / s.width
    const sy = h / s.height
    const layers = s.layers.map((l) => {
      const mask = l.mask ? scaleCanvas(l.mask, w, h) : null
      if (l.kind === 'raster' && l.canvas.width === s.width && l.canvas.height === s.height && isIdentity(l.matrix)) return { ...l, canvas: scaleCanvas(l.canvas, w, h), mask }
      const m = l.matrix
      return { ...l, matrix: [m[0] * sx, m[1] * sy, m[2] * sx, m[3] * sy, m[4] * sx, m[5] * sy] as Matrix, mask }
    }) as SLayer[]
    store.commit('Taille de l’image', { ...s, width: w, height: h, layers, selection: null })
  },

  /** Taille de la zone de travail (sans rééchantillonner), ancrée au centre. */
  canvasSize(store: StudioStore, w: number, h: number) {
    const s = store.state
    const dx = Math.round((w - s.width) / 2)
    const dy = Math.round((h - s.height) / 2)
    const layers = s.layers.map((l) => {
      const mask = l.mask ? offsetCanvas(l.mask, w, h, dx, dy) : null
      if (l.kind === 'raster' && l.canvas.width === s.width && isIdentity(l.matrix) && l.matrix[4] === 0) return { ...l, canvas: offsetCanvas(l.canvas, w, h, dx, dy), mask }
      return { ...l, matrix: [l.matrix[0], l.matrix[1], l.matrix[2], l.matrix[3], l.matrix[4] + dx, l.matrix[5] + dy] as Matrix, mask }
    }) as SLayer[]
    store.commit('Taille de la zone de travail', { ...s, width: w, height: h, layers, selection: null })
  },

  flip(store: StudioStore, axis: 'h' | 'v', whole: boolean) {
    const s = store.state
    const f: Matrix = axis === 'h' ? [-1, 0, 0, 1, s.width, 0] : [1, 0, 0, -1, 0, s.height]
    const target = whole ? s.layers : s.layers.filter((l) => l.id === s.activeId)
    const ids = new Set(target.map((l) => l.id))
    const layers = s.layers.map((l) => (ids.has(l.id) ? ({ ...l, matrix: mulM(f, l.matrix), mask: l.mask && whole ? flipCanvas(l.mask, axis) : l.mask } as SLayer) : l))
    store.commit(whole ? 'Symétrie de la zone de travail' : 'Symétrie du calque', { ...s, layers })
  },
}

function mulM(m: Matrix, n: Matrix): Matrix {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
}

export function descendants(s: SDocState, id: string): string[] {
  const kids = s.layers.filter((l) => l.parentId === id).map((l) => l.id)
  return kids.flatMap((k) => [k, ...descendants(s, k)])
}

const gray = (color: string) => {
  const m = color.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) || 0
  const g = parseInt(m.slice(2, 4), 16) || 0
  const b = parseInt(m.slice(4, 6), 16) || 0
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function cropCanvas(c: HTMLCanvasElement, r: { x: number; y: number; w: number; h: number }) {
  const out = makeCanvas(r.w, r.h)
  ctx2d(out).drawImage(c, -r.x, -r.y)
  return out
}
function scaleCanvas(c: HTMLCanvasElement, w: number, h: number) {
  const out = makeCanvas(w, h)
  const x = ctx2d(out)
  x.imageSmoothingQuality = 'high'
  x.drawImage(c, 0, 0, w, h)
  return out
}
function offsetCanvas(c: HTMLCanvasElement, w: number, h: number, dx: number, dy: number) {
  const out = makeCanvas(w, h)
  ctx2d(out).drawImage(c, dx, dy)
  return out
}
function flipCanvas(c: HTMLCanvasElement, axis: 'h' | 'v') {
  const out = makeCanvas(c.width, c.height)
  const x = ctx2d(out)
  if (axis === 'h') x.setTransform(-1, 0, 0, 1, c.width, 0)
  else x.setTransform(1, 0, 0, -1, 0, c.height)
  x.drawImage(c, 0, 0)
  return out
}

/** Coins d'un calque dans le document (pour le cadre de transformation). */
export function layerCorners(l: SLayer, doc: { width: number; height: number }) {
  let b = localBounds(l, doc)
  if (l.kind === 'raster') {
    const cb = contentBounds(l.canvas)
    if (cb) b = cb
  }
  const m = l.matrix
  return {
    local: b,
    corners: [apply(m, b.x, b.y), apply(m, b.x + b.w, b.y), apply(m, b.x + b.w, b.y + b.h), apply(m, b.x, b.y + b.h)],
    inverse: invert(m),
  }
}
