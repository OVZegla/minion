import { useSyncExternalStore } from 'react'
import { blobToCanvas, canvasToBlob } from './engine'
import type { SDocState, SLayer, SerializedDoc, SerializedLayer } from './types'

export interface HistoryStep {
  name: string
  state: SDocState
}

const MAX_HISTORY = 30

/**
 * Document du studio + historique (comme le panneau Historique de Photoshop).
 * Les états sont immuables : un calque modifié est remplacé, jamais modifié en place.
 */
export class StudioStore {
  steps: HistoryStep[]
  index = 0
  private listeners = new Set<() => void>()
  version = 0
  dirty = false

  constructor(initial: SDocState, name = 'Ouvrir') {
    this.steps = [{ name, state: initial }]
  }

  get state() {
    return this.steps[this.index].state
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getVersion = () => this.version
  private emit() {
    this.version++
    this.listeners.forEach((l) => l())
  }

  /** Nouvelle étape d'historique. */
  commit(name: string, next: SDocState) {
    this.steps = this.steps.slice(0, this.index + 1)
    this.steps.push({ name, state: next })
    if (this.steps.length > MAX_HISTORY) this.steps.shift()
    this.index = this.steps.length - 1
    this.dirty = true
    this.emit()
  }

  /** Changement sans étape d'historique (sélection du calque actif, aperçus…). */
  replace(next: SDocState) {
    this.steps[this.index] = { ...this.steps[this.index], state: next }
    this.emit()
  }

  update(name: string, f: (s: SDocState) => SDocState) {
    this.commit(name, f(this.state))
  }

  updateLayer(name: string, id: string, patch: Partial<SLayer>) {
    this.commit(name, { ...this.state, layers: this.state.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as SLayer) : l)) })
  }

  undo() {
    if (this.index > 0) {
      this.index--
      this.dirty = true
      this.emit()
    }
  }
  redo() {
    if (this.index < this.steps.length - 1) {
      this.index++
      this.dirty = true
      this.emit()
    }
  }
  goTo(i: number) {
    this.index = Math.max(0, Math.min(this.steps.length - 1, i))
    this.dirty = true
    this.emit()
  }
  touch() {
    this.emit()
  }
}

export function useStore(store: StudioStore) {
  useSyncExternalStore(store.subscribe, store.getVersion)
  return store.state
}

export const activeLayer = (s: SDocState) => s.layers.find((l) => l.id === s.activeId) ?? null

/* ---------- sérialisation ---------- */

export async function serialize(s: SDocState): Promise<SerializedDoc> {
  const layers: SerializedLayer[] = []
  for (const l of s.layers) {
    const { mask, ...rest } = l as SLayer & { canvas?: HTMLCanvasElement }
    const out: SerializedLayer = { ...(rest as unknown as SerializedLayer), mask: mask ? await canvasToBlob(mask) : null }
    if (l.kind === 'raster') out.canvas = await canvasToBlob(l.canvas)
    layers.push(out)
  }
  return { version: 1, width: s.width, height: s.height, layers, activeId: s.activeId }
}

export async function deserialize(d: SerializedDoc): Promise<SDocState> {
  const layers: SLayer[] = []
  for (const sl of d.layers) {
    const mask = sl.mask ? await blobToCanvas(sl.mask) : null
    const l = { ...sl, mask } as unknown as SLayer
    if (sl.kind === 'raster' && sl.canvas) (l as SLayer & { canvas: HTMLCanvasElement }).canvas = await blobToCanvas(sl.canvas)
    layers.push(l)
  }
  return { width: d.width, height: d.height, layers, activeId: d.activeId ?? layers[layers.length - 1]?.id ?? null, selection: null, editMask: false }
}
