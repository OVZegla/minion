import type { VPath } from '../pen/bezier'

export type Blend =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

/** Libellés de Photoshop (version française), dans le même ordre que le menu des calques. */
export const BLENDS: { id: Blend; label: string; sep?: boolean }[] = [
  { id: 'source-over', label: 'Normal' },
  { id: 'darken', label: 'Obscurcir', sep: true },
  { id: 'multiply', label: 'Produit' },
  { id: 'color-burn', label: 'Densité couleur +' },
  { id: 'lighten', label: 'Éclaircir', sep: true },
  { id: 'screen', label: 'Superposition' },
  { id: 'color-dodge', label: 'Densité couleur −' },
  { id: 'overlay', label: 'Incrustation', sep: true },
  { id: 'soft-light', label: 'Lumière tamisée' },
  { id: 'hard-light', label: 'Lumière crue' },
  { id: 'difference', label: 'Différence', sep: true },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Teinte', sep: true },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Couleur' },
  { id: 'luminosity', label: 'Luminosité' },
]

export type Matrix = [number, number, number, number, number, number] // a b c d e f
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

interface LayerBase {
  id: string
  name: string
  visible: boolean
  opacity: number // 0–1
  blend: Blend
  locked: boolean
  parentId: string | null // groupe parent
  mask: HTMLCanvasElement | null // masque de fusion (alpha : opaque = visible)
  maskEnabled: boolean
  matrix: Matrix // transformation (déplacement, échelle, rotation)
}

export interface RasterLayer extends LayerBase {
  kind: 'raster'
  canvas: HTMLCanvasElement // pixels, origine en (0,0) du calque
}

export interface TextLayer extends LayerBase {
  kind: 'text'
  text: string
  font: string
  size: number
  color: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  lineHeight: number
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'polygon' | 'path'

export interface ShapeLayer extends LayerBase {
  kind: 'shape'
  shape: ShapeKind
  w: number
  h: number
  sides: number
  radius: number
  path: VPath | null
  fill: string | null
  stroke: string | null
  strokeWidth: number
}

export interface GroupLayer extends LayerBase {
  kind: 'group'
  collapsed: boolean
}

export type SLayer = RasterLayer | TextLayer | ShapeLayer | GroupLayer

export interface SDocState {
  width: number
  height: number
  layers: SLayer[] // du bas vers le haut (comme l'ordre de rendu)
  activeId: string | null
  selection: HTMLCanvasElement | null // masque de sélection (alpha)
  editMask: boolean // on peint dans le masque du calque actif
}

/** Enregistrement en base (projet rééditable). */
export interface GraphicDoc {
  id: string
  createdAt: number
  updatedAt: number
  trashedAt?: number | null
  title: string
  width: number
  height: number
  thumb: Blob | null
  data: SerializedDoc
  openedAt?: number
}

export interface SerializedLayer extends Omit<LayerBase, 'mask'> {
  kind: SLayer['kind']
  mask: Blob | null
  canvas?: Blob // calque pixel
  [k: string]: unknown
}

export interface SerializedDoc {
  version: 1
  width: number
  height: number
  layers: SerializedLayer[]
  activeId: string | null
}
