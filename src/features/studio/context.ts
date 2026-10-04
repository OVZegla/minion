import { createContext, useContext } from 'react'
import type { StudioStore } from './store'
import type { ToolId } from './tools'

export interface UIState {
  tool: ToolId
  fg: string
  bg: string
  brush: { size: number; hardness: number; opacity: number; flow: number }
  eraser: { size: number; hardness: number; opacity: number }
  tolerance: number
  contiguous: boolean
  sampleAll: boolean
  feather: number
  gradient: 'linear' | 'radial'
  shape: { fill: string | null; stroke: string | null; strokeWidth: number; radius: number; sides: number }
  text: { font: string; size: number; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right' }
  zoom: number
  panX: number
  panY: number
  panelsHidden: boolean
}

export const DEFAULT_UI: UIState = {
  tool: 'brush',
  fg: '#000000',
  bg: '#ffffff',
  brush: { size: 24, hardness: 0.8, opacity: 1, flow: 1 },
  eraser: { size: 40, hardness: 0.9, opacity: 1 },
  tolerance: 32,
  contiguous: true,
  sampleAll: false,
  feather: 0,
  gradient: 'linear',
  shape: { fill: '#c98b8b', stroke: null, strokeWidth: 4, radius: 0, sides: 6 },
  text: { font: 'Inter Variable', size: 64, bold: false, italic: false, align: 'left' },
  zoom: 1,
  panX: 0,
  panY: 0,
  panelsHidden: false,
}

export const FONTS = ['Inter Variable', 'Fraunces Variable', 'Caveat', 'Georgia', 'Arial', 'Times New Roman', 'Courier New', 'Segoe UI', 'Trebuchet MS', 'Impact']

export interface StudioCtxValue {
  store: StudioStore
  ui: UIState
  setUi: (p: Partial<UIState> | ((u: UIState) => Partial<UIState>)) => void
  /** demande la pixellisation d'un calque texte/forme avant de peindre (comme Photoshop) */
  confirmRasterize: () => Promise<boolean>
  notify: (text: string) => void
}

export const StudioCtx = createContext<StudioCtxValue | null>(null)
export const useStudio = () => {
  const c = useContext(StudioCtx)
  if (!c) throw new Error('StudioCtx manquant')
  return c
}
