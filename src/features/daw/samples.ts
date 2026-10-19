import { DANIGB, GM_BASE, NB_BASE, TONE_AUDIO, type InstrumentDef } from './bank'

/** Une zone d'échantillon : un fichier joué sur une plage de notes et de vélocités. */
export interface Zone {
  lo: number
  hi: number
  root: number
  url: string
  tune: number // cents
  gain: number // dB
  vlo: number // 0–127
  vhi: number
  offset: number // secondes
}

/* ---------------- Décodage et cache ---------------- */

let decoder: BaseAudioContext | null = null
export function setDecoder(ctx: BaseAudioContext) {
  decoder = ctx
}
function getDecoder() {
  if (!decoder) decoder = new OfflineAudioContext(1, 1, 44100)
  return decoder
}

const buffers = new Map<string, Promise<AudioBuffer | null>>()
const ready = new Map<string, AudioBuffer>()

/** Charge (une seule fois) et décode un fichier son. */
export function loadBuffer(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${url}`)
        return r.arrayBuffer()
      })
      .then((ab) => getDecoder().decodeAudioData(ab))
      .then((b) => {
        ready.set(url, b)
        return b
      })
      .catch((e) => {
        console.warn('Son introuvable', e)
        buffers.delete(url)
        return null
      })
    buffers.set(url, p)
  }
  return p
}
export const bufferNow = (url: string) => ready.get(url)

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  return getDecoder().decodeAudioData(await blob.arrayBuffer())
}

/* ---------------- Noms de notes ---------------- */

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export function noteToMidi(n: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(n.trim())
  if (!m) return 60
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase() as 'C']
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (parseInt(m[3]) + 1) * 12 + base + acc
}
const flatName = (midi: number) => FLAT[midi % 12] + (Math.floor(midi / 12) - 1)
const sharpName = (midi: number) => SHARP[midi % 12] + (Math.floor(midi / 12) - 1)

/** Répartit le clavier entre des notes de référence (la plus proche joue). */
function spread(roots: { root: number; url: string }[], extra: Partial<Zone> = {}): Zone[] {
  const s = [...roots].sort((a, b) => a.root - b.root)
  return s.map((r, i) => ({
    lo: i === 0 ? 0 : Math.floor((s[i - 1].root + r.root) / 2) + 1,
    hi: i === s.length - 1 ? 127 : Math.floor((r.root + s[i + 1].root) / 2),
    root: r.root,
    url: r.url,
    tune: 0,
    gain: 0,
    vlo: 0,
    vhi: 127,
    offset: 0,
    ...extra,
  }))
}

/* ---------------- Formats des banques ---------------- */

interface WebSfzRegion {
  sample: string
  lokey?: number
  hikey?: number
  key?: number
  pitch_keycenter?: number
  lovel?: number
  hivel?: number
  xfin_lovel?: number
  xfin_hivel?: number
  xfout_lovel?: number
  xfout_hivel?: number
  tune?: number
  transpose?: number
  volume?: number
  offset?: number
  trigger?: string
  seq_position?: number
  lorand?: number
  sw_last?: number
  sw_lokey?: number
}
interface WebSfz {
  meta?: { baseUrl?: string }
  global?: Partial<WebSfzRegion> & { default_path?: string }
  groups: ({ regions: WebSfzRegion[] } & Partial<WebSfzRegion>)[]
}

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/')

async function sfzZones(path: string): Promise<Zone[]> {
  const url = `${DANIGB}${enc(path)}.websfz.json`
  const json = (await (await fetch(url)).json()) as WebSfz
  const baseUrl = json.meta?.baseUrl ?? url.slice(0, url.lastIndexOf('/') + 1)
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  const prefix = json.global?.default_path ?? ''
  const zones: Zone[] = []
  for (const g of json.groups ?? []) {
    const { regions, ...gp } = g
    for (const reg of regions ?? []) {
      const r = { ...json.global, ...gp, ...reg } as WebSfzRegion
      if (!r.sample || r.trigger === 'release') continue
      if ((r.seq_position ?? 1) > 1 || (r.lorand ?? 0) > 0) continue
      const root = r.pitch_keycenter ?? r.key ?? r.lokey ?? 60
      const lo = r.lokey ?? r.key ?? root
      const hi = r.hikey ?? r.key ?? root
      let vlo = r.lovel ?? 0
      let vhi = r.hivel ?? 127
      if (r.xfin_lovel !== undefined) vlo = Math.round(((r.xfin_lovel ?? 0) + (r.xfin_hivel ?? 127)) / 2)
      if (r.xfout_lovel !== undefined) vhi = Math.round(((r.xfout_lovel ?? 0) + (r.xfout_hivel ?? 127)) / 2)
      let sample = (prefix + r.sample).replace(/\\/g, '/').replace(/\.(wav|flac|ogg|m4a|mp3)$/i, '')
      // certains index répètent le dossier de base (ex. « TX81Z/TX81Z/… »)
      const lastDir = decodeURIComponent(base.split('/').filter(Boolean).pop() ?? '')
      if (lastDir && sample.startsWith(`${lastDir}/`)) sample = sample.slice(lastDir.length + 1)
      zones.push({ lo, hi, root: root - (r.transpose ?? 0), url: base + enc(sample) + '.m4a', tune: r.tune ?? 0, gain: r.volume ?? 0, vlo, vhi, offset: (r.offset ?? 0) / 44100 })
    }
  }
  return zones
}

async function splendidZones(): Promise<Zone[]> {
  const json = (await (await fetch(`${DANIGB}splendid-grand-piano/samples.json`)).json()) as {
    layers: { vel: [number, number]; samples: { midi: number; url: string }[] }[]
  }
  return json.layers.flatMap((l) =>
    spread(
      l.samples.map((s) => ({ root: s.midi, url: `${DANIGB}splendid-grand-piano/${enc(s.url)}.m4a` })),
      { vlo: l.vel[0], vhi: l.vel[1] },
    ),
  )
}

/** Zones d'un instrument échantillonné (sans rien télécharger d'autre qu'un éventuel index). */
export async function zonesFor(def: InstrumentDef): Promise<Zone[]> {
  const s = def.src
  switch (s.kind) {
    case 'gm': {
      const roots = []
      for (let m = 21; m <= 108; m += 3) roots.push({ root: m, url: `${GM_BASE}${s.name}-mp3/${flatName(m)}.mp3` })
      return spread(roots)
    }
    case 'nb':
      return spread(s.notes.split(' ').map((n) => ({ root: noteToMidi(n), url: `${NB_BASE}${s.name}/${n.replace('#', 's')}.mp3` })))
    case 'salamander': {
      const roots = []
      for (let m = 21; m <= 108; m += 3) roots.push({ root: m, url: `${TONE_AUDIO}salamander/${sharpName(m).replace('#', 's')}.mp3` })
      return spread(roots)
    }
    case 'splendid':
      return splendidZones()
    case 'sfz':
      return sfzZones(s.path)
    default:
      return []
  }
}

/** Zone qui joue une note donnée à une vélocité donnée. */
export function pickZone(zones: Zone[], p: number, vel127: number): Zone | null {
  let best: Zone | null = null
  let bestScore = Infinity
  for (const z of zones) {
    const keyDist = p < z.lo ? z.lo - p : p > z.hi ? p - z.hi : 0
    const velDist = vel127 < z.vlo ? z.vlo - vel127 : vel127 > z.vhi ? vel127 - z.vhi : 0
    const score = keyDist * 1000 + velDist + Math.abs(p - z.root) * 0.01
    if (score < bestScore) {
      bestScore = score
      best = z
    }
  }
  return best
}
