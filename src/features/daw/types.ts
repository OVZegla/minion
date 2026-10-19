/** Studio musique : projets multipistes. Positions en temps (noires). */

export interface MidiNote {
  id: string
  p: number // hauteur MIDI
  t: number // début, en temps, relatif au clip
  d: number // durée, en temps
  v: number // vélocité 0–1
}

export interface Clip {
  id: string
  start: number // temps (noires) depuis le début du morceau
  name: string
  color?: string
  muted?: boolean
  // clip MIDI
  length?: number // en temps
  notes?: MidiNote[]
  // clip audio
  audioId?: string
  offset?: number // secondes sautées au début du fichier
  duration?: number // secondes jouées
  gain?: number // dB
  fadeIn?: number // secondes
  fadeOut?: number // secondes
}

export type FxType = 'eq' | 'comp' | 'reverb' | 'delay' | 'chorus' | 'drive' | 'filter' | 'tremolo' | 'lofi'

export interface Effect {
  id: string
  type: FxType
  on: boolean
  params: Record<string, number>
}

export type TrackKind = 'audio' | 'instrument' | 'drums'

export interface Track {
  id: string
  name: string
  kind: TrackKind
  color: string
  instrument: string // id du catalogue (instrument ou kit) ; vide pour l'audio
  volume: number // dB
  pan: number // -1 à 1
  send: number // envoi vers la réverbe commune, 0–1
  mute: boolean
  solo: boolean
  arm: boolean
  monitor?: boolean
  fx: Effect[]
  clips: Clip[]
}

export interface DawProject {
  id: string
  createdAt: number
  updatedAt: number
  openedAt?: number
  trashedAt?: number | null
  title: string
  bpm: number
  timeSig: [number, number]
  key?: string
  loop: { on: boolean; start: number; end: number }
  metronome: boolean
  countIn: number // mesures de décompte avant l'enregistrement
  masterVolume: number // dB
  masterFx: Effect[]
  reverbSize: number // réverbe commune (0–1)
  tracks: Track[]
  latencyMs?: number // compensation manuelle
}

export interface DawAudio {
  id: string
  createdAt: number
  name: string
  blob: Blob
  duration: number
}

export const beatsPerBar = (ts: [number, number]) => ts[0] * (4 / ts[1])
export const secPerBeat = (bpm: number) => 60 / bpm

/** Longueur d'un clip, en temps. */
export function clipBeats(c: Clip, bpm: number) {
  if (c.audioId) return ((c.duration ?? 0) * bpm) / 60
  return c.length ?? 4
}

export const clipEnd = (c: Clip, bpm: number) => c.start + clipBeats(c, bpm)

export function projectEnd(p: DawProject) {
  let end = 0
  for (const t of p.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c, p.bpm))
  return end
}

export const TRACK_COLORS = ['#e07a5f', '#f2cc8f', '#81b29a', '#6d9dc5', '#b388eb', '#f28482', '#84a59d', '#e9c46a', '#5fa8d3', '#c77dff', '#ff9f68', '#4fb39f']
