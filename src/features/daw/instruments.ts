import { getInstrument, getKit, type InstrumentDef, type KitDef, type SynthParams } from './bank'
import { bufferNow, loadBuffer, pickZone, zonesFor, type Zone } from './samples'

export interface Voice {
  stop(when: number): void
}

export interface Instrument {
  readonly id: string
  /** Télécharge ce qu'il faut pour jouer ces notes. */
  prepare(pitches: Iterable<number>, vel?: number): Promise<void>
  /** Précharge l'essentiel pour jouer en direct. */
  warm(): Promise<void>
  noteOn(ctx: BaseAudioContext, dest: AudioNode, p: number, v: number, when: number, live?: boolean): Voice | null
}

const dbGain = (db: number) => Math.pow(10, db / 20)
const velGain = (v: number) => 0.08 + 0.92 * Math.pow(Math.max(0, Math.min(1, v)), 1.4)
const NOOP: Voice = { stop() {} }

/* ---------------- Échantillonneur ---------------- */

/** Gain de normalisation par instrument (mesuré sur une note de référence, partagé direct / export). */
const NORM = new Map<string, number>()
const TARGET_PEAK = 0.4

function peakOf(b: AudioBuffer) {
  const d = b.getChannelData(0)
  const n = Math.min(d.length, b.sampleRate * 2)
  let m = 0
  for (let i = 0; i < n; i++) {
    const a = Math.abs(d[i])
    if (a > m) m = a
  }
  return m
}

class Sampler implements Instrument {
  readonly id: string
  private zones: Promise<Zone[]>
  private z: Zone[] = []
  private ref: Zone | null = null
  private release: number
  private gain: number
  private oneShot: boolean
  constructor(def: InstrumentDef) {
    this.id = def.id
    this.release = def.release ?? 0.4
    this.gain = dbGain(def.gain ?? 0)
    this.oneShot = !!def.oneShot
    this.zones = zonesFor(def)
      .then((z) => {
        this.z = z
        this.ref = pickZone(z, 60, 100)
        return z
      })
      .catch((e) => {
        console.warn(e)
        return []
      })
  }
  /** Mesure (une fois) le niveau de la note de référence. */
  private async normalize() {
    await this.zones
    if (NORM.has(this.id) || !this.ref) return
    const b = await loadBuffer(this.ref.url)
    if (!b) return
    const pk = peakOf(b) * dbGain(this.ref.gain)
    NORM.set(this.id, pk > 0 ? Math.max(0.4, Math.min(10, TARGET_PEAK / pk)) : 1)
  }
  async prepare(pitches: Iterable<number>, vel = 0.8) {
    const zones = await this.zones
    await this.normalize()
    const urls = new Set<string>()
    for (const p of pitches) {
      const z = pickZone(zones, p, vel * 127)
      if (z) urls.add(z.url)
    }
    await Promise.all([...urls].map(loadBuffer))
  }
  async warm() {
    const zones = await this.zones
    await this.normalize()
    // l'essentiel du clavier, à vélocité moyenne : du do1 au do6
    const mid = new Set<string>()
    for (let p = 36; p <= 84; p++) {
      const z = pickZone(zones, p, 90)
      if (z) mid.add(z.url)
    }
    await Promise.all([...mid].map(loadBuffer))
  }
  noteOn(ctx: BaseAudioContext, dest: AudioNode, p: number, v: number, when: number, live = false): Voice | null {
    const zone = pickZone(this.z, p, v * 127)
    if (!zone) return null
    const buf = bufferNow(zone.url)
    if (!buf) {
      // pas encore téléchargé : on lance le chargement, et en direct on joue dès que possible
      if (!live) {
        void loadBuffer(zone.url)
        return null
      }
      let stopped = false
      let inner: Voice | null = null
      void loadBuffer(zone.url).then((b) => {
        if (b && !stopped && 'currentTime' in ctx) inner = this.noteOn(ctx, dest, p, v, (ctx as AudioContext).currentTime, false)
      })
      return {
        stop: (t) => {
          stopped = true
          inner?.stop(t)
        },
      }
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = Math.pow(2, (p - zone.root + zone.tune / 100) / 12)
    const g = ctx.createGain()
    if (!NORM.has(this.id)) void this.normalize()
    const level = velGain(v) * dbGain(zone.gain) * this.gain * (NORM.get(this.id) ?? 1)
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(level, when + 0.004)
    src.connect(g).connect(dest)
    src.start(when, Math.min(zone.offset, buf.duration * 0.5))
    const rel = this.release
    let done = false
    return {
      stop: (t) => {
        if (done) return
        done = true
        const at = Math.max(t, when + 0.01)
        if (this.oneShot) {
          // les percussions sonnent jusqu'au bout, avec une fin douce
          g.gain.setTargetAtTime(0, at + 1.2, 0.3)
          try {
            src.stop(at + 3)
          } catch {
            /* déjà arrêté */
          }
          return
        }
        g.gain.cancelScheduledValues(at)
        g.gain.setValueAtTime(level, at)
        g.gain.setTargetAtTime(0, at, rel / 4)
        try {
          src.stop(at + rel * 1.6 + 0.05)
        } catch {
          /* déjà arrêté */
        }
      },
    }
  }
}

/* ---------------- Batterie ---------------- */

const FALLBACK: Record<number, number[]> = {
  35: [36],
  40: [38],
  39: [38, 37],
  37: [38],
  46: [42],
  44: [42],
  51: [49, 46],
  49: [51, 46],
  43: [41],
  47: [45],
  50: [48],
  45: [41, 48],
  56: [37],
  54: [70, 42],
  70: [54, 42],
  75: [37],
  62: [48],
  64: [45],
}

class DrumKit implements Instrument {
  readonly id: string
  private kit: KitDef
  private open = new WeakMap<BaseAudioContext, { g: GainNode; src: AudioBufferSourceNode }>()
  constructor(kit: KitDef) {
    this.id = kit.id
    this.kit = kit
  }
  private urlFor(p: number): string | null {
    if (this.kit.pads[p]) return this.kit.pads[p]
    for (const f of FALLBACK[p] ?? []) if (this.kit.pads[f]) return this.kit.pads[f]
    return null
  }
  async prepare(pitches: Iterable<number>) {
    const urls = new Set<string>()
    for (const p of pitches) {
      const u = this.urlFor(p)
      if (u) urls.add(u)
    }
    await Promise.all([...urls].map(loadBuffer))
  }
  async warm() {
    await Promise.all(Object.values(this.kit.pads).map(loadBuffer))
  }
  noteOn(ctx: BaseAudioContext, dest: AudioNode, p: number, v: number, when: number, live = false): Voice | null {
    const url = this.urlFor(p)
    if (!url) return null
    const buf = bufferNow(url)
    if (!buf) {
      void loadBuffer(url).then((b) => {
        if (b && live && 'currentTime' in ctx) this.noteOn(ctx, dest, p, v, (ctx as AudioContext).currentTime)
      })
      return null
    }
    // le charley fermé coupe le charley ouvert
    if (p === 42 || p === 44 || p === 46) {
      const prev = this.open.get(ctx)
      if (prev) {
        prev.g.gain.setTargetAtTime(0, when, 0.015)
        this.open.delete(ctx)
      }
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = velGain(v)
    src.connect(g).connect(dest)
    src.start(when)
    if (p === 46) this.open.set(ctx, { g, src })
    return NOOP
  }
}

/* ---------------- Synthétiseur ---------------- */

let noiseBuf: AudioBuffer | null = null
function noise() {
  if (!noiseBuf) {
    noiseBuf = new AudioBuffer({ length: 44100 * 2, sampleRate: 44100, numberOfChannels: 1 })
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

class Synth implements Instrument {
  readonly id: string
  private p: SynthParams
  constructor(id: string, p: SynthParams) {
    this.id = id
    this.p = p
  }
  async prepare() {}
  async warm() {}
  noteOn(ctx: BaseAudioContext, dest: AudioNode, note: number, v: number, when: number): Voice {
    const P = this.p
    const out = ctx.createGain()
    const level = velGain(v) * dbGain(P.gain ?? 0) * 0.5
    const { a, d, s, r } = P.amp
    out.gain.setValueAtTime(0, when)
    out.gain.linearRampToValueAtTime(level, when + Math.max(0.001, a))
    out.gain.setTargetAtTime(level * s, when + a, Math.max(0.005, d / 3))

    let head: AudioNode = out
    let filter: BiquadFilterNode | null = null
    if (P.filter) {
      filter = ctx.createBiquadFilter()
      filter.type = P.filter.type ?? 'lowpass'
      filter.Q.value = P.filter.q ?? 1
      const kt = P.filter.keytrack ?? 0.5
      const base = Math.min(18000, P.filter.cutoff * Math.pow(2, ((note - 60) / 12) * kt))
      const amt = P.filter.env ?? 0
      filter.frequency.setValueAtTime(base, when)
      if (amt && P.fenv) {
        const fe = P.fenv
        const peak = Math.min(18000, base + amt)
        filter.frequency.linearRampToValueAtTime(peak, when + Math.max(0.001, fe.a))
        filter.frequency.setTargetAtTime(base + amt * fe.s, when + fe.a, Math.max(0.005, fe.d / 3))
      }
      filter.connect(out)
      head = filter
    }

    const f0 = mtof(note)
    const sources: AudioScheduledSourceNode[] = []
    let lfo: OscillatorNode | null = null
    let lfoGain: GainNode | null = null
    if (P.vibrato) {
      lfo = ctx.createOscillator()
      lfo.frequency.value = P.vibrato.rate
      lfoGain = ctx.createGain()
      lfoGain.gain.setValueAtTime(0, when)
      lfoGain.gain.linearRampToValueAtTime(P.vibrato.depth, when + 0.25)
      lfo.connect(lfoGain)
      sources.push(lfo)
    }
    const uni = Math.max(1, P.unison ?? 1)
    const spreadC = P.spread ?? 0
    for (const o of P.osc) {
      const og = ctx.createGain()
      og.gain.value = (o.gain ?? 1) / Math.sqrt(uni)
      og.connect(head)
      for (let u = 0; u < uni; u++) {
        const osc = ctx.createOscillator()
        osc.type = o.type
        const freq = f0 * Math.pow(2, o.oct ?? 0)
        if (P.pitchEnv) {
          osc.frequency.setValueAtTime(freq * Math.pow(2, P.pitchEnv.amt / 12), when)
          osc.frequency.exponentialRampToValueAtTime(freq, when + P.pitchEnv.time)
        } else osc.frequency.value = freq
        osc.detune.value = (o.detune ?? 0) + (uni > 1 ? (u / (uni - 1) - 0.5) * 2 * spreadC : 0)
        if (lfoGain) lfoGain.connect(osc.detune)
        osc.connect(og)
        sources.push(osc)
      }
    }
    if (P.noise) {
      const n = ctx.createBufferSource()
      n.buffer = noise()
      n.loop = true
      const ng = ctx.createGain()
      ng.gain.value = P.noise
      n.connect(ng).connect(head)
      sources.push(n)
    }
    out.connect(dest)
    for (const src of sources) src.start(when)
    let done = false
    return {
      stop: (t) => {
        if (done) return
        done = true
        const at = Math.max(t, when + 0.01)
        // valeur de l'enveloppe à cet instant (sinon une note plus courte que l'attaque serait muette)
        const el = at - when
        const cur = el < a ? level * (el / Math.max(0.001, a)) : level * s + (level - level * s) * Math.exp(-(el - a) / Math.max(0.005, d / 3))
        out.gain.cancelScheduledValues(at)
        out.gain.setValueAtTime(cur, at)
        out.gain.setTargetAtTime(0, at, Math.max(0.005, r / 4))
        if (filter && P.fenv && P.filter?.env) filter.frequency.setTargetAtTime(Math.min(18000, P.filter.cutoff), at, Math.max(0.005, P.fenv.r / 4))
        const end = at + r * 1.8 + 0.05
        for (const src of sources) src.stop(end)
      },
    }
  }
}

/* ---------------- Fabrique ---------------- */

const SILENT: Instrument = { id: '', prepare: async () => {}, warm: async () => {}, noteOn: () => null }

export function createInstrument(id: string): Instrument {
  const kit = getKit(id)
  if (kit) return new DrumKit(kit)
  const def = getInstrument(id)
  if (!def) return SILENT
  if (def.src.kind === 'synth') return new Synth(def.id, def.src.p)
  return new Sampler(def)
}
