import type { Song, SongNote } from '../../db/types'

export const NAMES = {
  fr: ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'],
  en: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
}

export const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)

/**
 * Nom d'une note. Convention française : le do central (MIDI 60) est « Do3 » ;
 * convention anglaise : « C4 ».
 */
export function noteName(midi: number, lang: 'fr' | 'en' = 'fr', octave = true) {
  const pc = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - (lang === 'fr' ? 2 : 1)
  return NAMES[lang][pc] + (octave ? oct : '')
}

export const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

export const DURATIONS = [
  { v: 4, label: 'Ronde', short: '𝅝', key: '1' },
  { v: 2, label: 'Blanche', short: '𝅗𝅥', key: '2' },
  { v: 1, label: 'Noire', short: '♩', key: '3' },
  { v: 0.5, label: 'Croche', short: '♪', key: '4' },
  { v: 0.25, label: 'Double croche', short: '𝅘𝅥𝅯', key: '5' },
]

export function durationLabel(d: number) {
  const base = DURATIONS.find((x) => x.v === d)
  if (base) return base.label
  const dotted = DURATIONS.find((x) => x.v * 1.5 === d)
  if (dotted) return `${dotted.label} pointée`
  return `${d} temps`
}

/** Durée d'une mesure, en noires. */
export const beatsPerMeasure = (ts: [number, number]) => ts[0] * (4 / ts[1])

export const songLength = (s: Pick<Song, 'measures' | 'timeSig'>) => s.measures * beatsPerMeasure(s.timeSig)

/** Valeurs représentables sur une portée (avec points). */
const REPRESENTABLE = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125]

/** Découpe une durée en valeurs écrivables (liées entre elles si besoin). */
export function decompose(dur: number): number[] {
  const out: number[] = []
  let rest = Math.round(dur * 1000) / 1000
  let guard = 0
  while (rest > 0.06 && guard++ < 20) {
    const v = REPRESENTABLE.find((r) => r <= rest + 1e-6) ?? 0.125
    out.push(v)
    rest = Math.round((rest - v) * 1000) / 1000
  }
  return out
}

/** Mesure (index) et position dans la mesure d'un temps donné. */
export function measureOf(beat: number, ts: [number, number]) {
  const bpm = beatsPerMeasure(ts)
  const m = Math.floor(beat / bpm + 1e-9)
  return { measure: m, offset: beat - m * bpm }
}

export interface Piece {
  note: SongNote
  start: number
  dur: number
  tieToNext: boolean
}

/** Coupe les notes aux barres de mesure (pour l'écriture sur portée). */
export function splitAtBars(notes: SongNote[], ts: [number, number]): Piece[] {
  const bpm = beatsPerMeasure(ts)
  const out: Piece[] = []
  for (const n of notes) {
    let s = n.start
    const end = n.start + n.dur
    while (s < end - 1e-6) {
      const barEnd = (Math.floor(s / bpm + 1e-9) + 1) * bpm
      const e = Math.min(end, barEnd)
      out.push({ note: n, start: s, dur: e - s, tieToNext: e < end - 1e-6 })
      s = e
    }
  }
  return out
}

/** Regroupe les notes qui commencent ensemble (accords). */
export function groupByStart<T extends { start: number }>(items: T[]): { start: number; items: T[] }[] {
  const map = new Map<number, T[]>()
  for (const it of items) {
    const k = Math.round(it.start * 1000) / 1000
    map.set(k, [...(map.get(k) ?? []), it])
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([start, items]) => ({ start, items }))
}

/** Silences d'une main dans une mesure : trous entre les notes. */
export function restsInMeasure(notes: { start: number; dur: number }[], mStart: number, mLen: number) {
  const sorted = [...notes].sort((a, b) => a.start - b.start)
  const rests: { start: number; dur: number }[] = []
  let cur = mStart
  for (const n of sorted) {
    if (n.start > cur + 1e-6) rests.push({ start: cur, dur: n.start - cur })
    cur = Math.max(cur, n.start + n.dur)
  }
  if (cur < mStart + mLen - 1e-6) rests.push({ start: cur, dur: mStart + mLen - cur })
  return rests
}

/** Clavier d'ordinateur → notes (rangée du milieu = touches blanches, comme un mini clavier). */
export const COMPUTER_KEYS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
}
