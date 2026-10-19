import type { Effect, FxType } from './types'

export interface ParamDef {
  key: string
  label: string
  min: number
  max: number
  step?: number
  def: number
  unit?: string
  log?: boolean
  options?: string[]
}

export interface FxDef {
  type: FxType
  name: string
  emoji: string
  params: ParamDef[]
}

export const DELAY_DIVS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4]
const DIV_LABELS = ['1/16', '1/8', '1/8 pointée', '1/4', '1/4 pointée', '1/2', '1 mesure']

export const FX_DEFS: FxDef[] = [
  {
    type: 'eq',
    name: 'Égaliseur',
    emoji: '🎚️',
    params: [
      { key: 'hpf', label: 'Coupe-bas', min: 20, max: 600, def: 20, unit: 'Hz', log: true },
      { key: 'low', label: 'Graves', min: -15, max: 15, step: 0.5, def: 0, unit: 'dB' },
      { key: 'midf', label: 'Fréq. médiums', min: 200, max: 8000, def: 1200, unit: 'Hz', log: true },
      { key: 'mid', label: 'Médiums', min: -15, max: 15, step: 0.5, def: 0, unit: 'dB' },
      { key: 'midq', label: 'Largeur', min: 0.3, max: 6, step: 0.1, def: 1, unit: 'q' },
      { key: 'high', label: 'Aigus', min: -15, max: 15, step: 0.5, def: 0, unit: 'dB' },
    ],
  },
  {
    type: 'comp',
    name: 'Compresseur',
    emoji: '🗜️',
    params: [
      { key: 'threshold', label: 'Seuil', min: -60, max: 0, step: 0.5, def: -20, unit: 'dB' },
      { key: 'ratio', label: 'Taux', min: 1, max: 20, step: 0.5, def: 4, unit: ':1' },
      { key: 'attack', label: 'Attaque', min: 0.5, max: 200, def: 8, unit: 'ms', log: true },
      { key: 'release', label: 'Relâchement', min: 20, max: 1000, def: 160, unit: 'ms', log: true },
      { key: 'makeup', label: 'Gain', min: 0, max: 24, step: 0.5, def: 4, unit: 'dB' },
    ],
  },
  {
    type: 'reverb',
    name: 'Réverbe',
    emoji: '🏛️',
    params: [
      { key: 'size', label: 'Durée', min: 0.3, max: 8, step: 0.1, def: 2.2, unit: 's', log: true },
      { key: 'predelay', label: 'Pré-délai', min: 0, max: 120, def: 15, unit: 'ms' },
      { key: 'tone', label: 'Brillance', min: 1000, max: 16000, def: 6000, unit: 'Hz', log: true },
      { key: 'mix', label: 'Dosage', min: 0, max: 1, step: 0.01, def: 0.25 },
    ],
  },
  {
    type: 'delay',
    name: 'Écho',
    emoji: '🔁',
    params: [
      { key: 'div', label: 'Temps', min: 0, max: 6, step: 1, def: 2, options: DIV_LABELS },
      { key: 'feedback', label: 'Répétitions', min: 0, max: 0.9, step: 0.01, def: 0.35 },
      { key: 'tone', label: 'Couleur', min: 800, max: 14000, def: 4500, unit: 'Hz', log: true },
      { key: 'mix', label: 'Dosage', min: 0, max: 1, step: 0.01, def: 0.22 },
    ],
  },
  {
    type: 'chorus',
    name: 'Chorus',
    emoji: '🌊',
    params: [
      { key: 'rate', label: 'Vitesse', min: 0.05, max: 6, step: 0.05, def: 0.8, unit: 'Hz', log: true },
      { key: 'depth', label: 'Profondeur', min: 0, max: 8, step: 0.1, def: 3, unit: 'ms' },
      { key: 'mix', label: 'Dosage', min: 0, max: 1, step: 0.01, def: 0.5 },
    ],
  },
  {
    type: 'drive',
    name: 'Saturation',
    emoji: '🔥',
    params: [
      { key: 'drive', label: 'Grain', min: 0, max: 1, step: 0.01, def: 0.35 },
      { key: 'tone', label: 'Couleur', min: 500, max: 16000, def: 6000, unit: 'Hz', log: true },
      { key: 'mix', label: 'Dosage', min: 0, max: 1, step: 0.01, def: 1 },
      { key: 'out', label: 'Sortie', min: -24, max: 6, step: 0.5, def: -4, unit: 'dB' },
    ],
  },
  {
    type: 'filter',
    name: 'Filtre',
    emoji: '🌀',
    params: [
      { key: 'mode', label: 'Type', min: 0, max: 2, step: 1, def: 0, options: ['Passe-bas', 'Passe-haut', 'Passe-bande'] },
      { key: 'freq', label: 'Fréquence', min: 40, max: 18000, def: 2400, unit: 'Hz', log: true },
      { key: 'q', label: 'Résonance', min: 0.3, max: 18, step: 0.1, def: 1, unit: 'q' },
      { key: 'lfo', label: 'Balayage', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'rate', label: 'Vitesse', min: 0.05, max: 8, step: 0.05, def: 0.5, unit: 'Hz', log: true },
    ],
  },
  {
    type: 'tremolo',
    name: 'Trémolo',
    emoji: '〰️',
    params: [
      { key: 'rate', label: 'Vitesse', min: 0.5, max: 16, step: 0.1, def: 5, unit: 'Hz', log: true },
      { key: 'depth', label: 'Profondeur', min: 0, max: 1, step: 0.01, def: 0.5 },
    ],
  },
  {
    type: 'lofi',
    name: 'Lo-fi',
    emoji: '📼',
    params: [
      { key: 'bits', label: 'Bits', min: 2, max: 12, step: 1, def: 7, unit: ' bits' },
      { key: 'tone', label: 'Couleur', min: 600, max: 12000, def: 3500, unit: 'Hz', log: true },
      { key: 'mix', label: 'Dosage', min: 0, max: 1, step: 0.01, def: 0.6 },
    ],
  },
]

export const fxDef = (t: FxType) => FX_DEFS.find((d) => d.type === t)!

export function newEffect(type: FxType, params: Record<string, number> = {}): Effect {
  const def = fxDef(type)
  const p: Record<string, number> = {}
  for (const x of def.params) p[x.key] = x.def
  return { id: crypto.randomUUID(), type, on: true, params: { ...p, ...params } }
}

/* ---------------- Préréglages de chaînes ---------------- */

export const FX_PRESETS: { name: string; for: 'voix' | 'instrument' | 'tout'; chain: () => Effect[] }[] = [
  { name: 'Voix naturelle', for: 'voix', chain: () => [newEffect('eq', { hpf: 80, mid: 1.5, midf: 3000, high: 2 }), newEffect('comp', { threshold: -18, ratio: 3, makeup: 3 }), newEffect('reverb', { size: 1.2, mix: 0.14 })] },
  { name: 'Voix pop', for: 'voix', chain: () => [newEffect('eq', { hpf: 100, low: -1, mid: 3, midf: 3200, high: 4 }), newEffect('comp', { threshold: -24, ratio: 4, attack: 5, makeup: 6 }), newEffect('delay', { div: 2, feedback: 0.25, mix: 0.12 }), newEffect('reverb', { size: 2, mix: 0.2 })] },
  { name: 'Voix intime', for: 'voix', chain: () => [newEffect('eq', { hpf: 70, low: 2, high: 5 }), newEffect('comp', { threshold: -28, ratio: 6, attack: 3, makeup: 8 }), newEffect('reverb', { size: 0.7, mix: 0.1 })] },
  { name: 'Grande salle', for: 'tout', chain: () => [newEffect('eq', { hpf: 90 }), newEffect('comp', { threshold: -20, ratio: 3 }), newEffect('reverb', { size: 4.5, predelay: 35, mix: 0.36 })] },
  { name: 'Écho rêveur', for: 'tout', chain: () => [newEffect('chorus', { mix: 0.35 }), newEffect('delay', { div: 3, feedback: 0.45, mix: 0.3 }), newEffect('reverb', { size: 3.2, mix: 0.3 })] },
  { name: 'Radio', for: 'voix', chain: () => [newEffect('filter', { mode: 2, freq: 1600, q: 1.1 }), newEffect('drive', { drive: 0.45, out: -6 }), newEffect('comp', { threshold: -22, ratio: 6 })] },
  { name: 'Téléphone', for: 'voix', chain: () => [newEffect('filter', { mode: 2, freq: 1900, q: 2.2 }), newEffect('lofi', { bits: 8, mix: 0.5 })] },
  { name: 'Robot', for: 'voix', chain: () => [newEffect('lofi', { bits: 4, tone: 5000, mix: 0.8 }), newEffect('tremolo', { rate: 14, depth: 0.7 })] },
  { name: 'Cassette lo-fi', for: 'instrument', chain: () => [newEffect('lofi', { bits: 9, tone: 4200, mix: 0.5 }), newEffect('chorus', { rate: 0.3, depth: 2, mix: 0.4 }), newEffect('filter', { freq: 5000 })] },
  { name: 'Large et brillant', for: 'instrument', chain: () => [newEffect('eq', { high: 3, low: 1 }), newEffect('chorus', { mix: 0.4 }), newEffect('reverb', { size: 2.5, mix: 0.25 })] },
  { name: 'Basse ronde', for: 'instrument', chain: () => [newEffect('eq', { hpf: 30, low: 3, high: -4 }), newEffect('comp', { threshold: -20, ratio: 5, makeup: 4 }), newEffect('drive', { drive: 0.15, out: -2 })] },
  { name: 'Batterie qui claque', for: 'instrument', chain: () => [newEffect('eq', { low: 3, high: 2.5 }), newEffect('comp', { threshold: -22, ratio: 4, attack: 20, release: 120, makeup: 5 }), newEffect('drive', { drive: 0.2, mix: 0.4, out: -2 })] },
  { name: 'Filtre qui respire', for: 'instrument', chain: () => [newEffect('filter', { freq: 900, q: 6, lfo: 0.7, rate: 0.25 }), newEffect('delay', { div: 2, mix: 0.18 })] },
]

/* ---------------- Construction des effets ---------------- */

export interface FxNode {
  input: AudioNode
  output: AudioNode
  set(params: Record<string, number>, bpm: number): void
  dispose(): void
}

/** Réponse impulsionnelle synthétique : bruit stéréo à décroissance exponentielle, adouci. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, tone = 6000): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.max(1, Math.floor(sr * seconds))
  const buf = ctx.createBuffer(2, len, sr)
  const a = Math.exp((-2 * Math.PI * tone) / sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      const n = Math.random() * 2 - 1
      lp = lp * a + n * (1 - a)
      // premières réflexions plus marquées, puis queue lisse
      const early = i < sr * 0.05 && Math.random() < 0.012 ? (Math.random() * 2 - 1) * 0.6 : 0
      d[i] = (lp * 1.6 + early) * Math.pow(1 - t, 2.4) * Math.exp(-t * 3)
    }
  }
  return buf
}

function shaperCurve(drive: number) {
  const n = 2048
  const c = new Float32Array(n)
  const k = 1 + drive * 40
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  return c
}
function crushCurve(bits: number) {
  const n = 4096
  const c = new Float32Array(n)
  const steps = Math.pow(2, bits - 1)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.round(x * steps) / steps
  }
  return c
}

const dbg = (db: number) => Math.pow(10, db / 20)

function wetDry(ctx: BaseAudioContext) {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  input.connect(dry).connect(output)
  wet.connect(output)
  const mix = (m: number) => {
    // loi à puissance constante
    dry.gain.value = Math.cos((m * Math.PI) / 2)
    wet.gain.value = Math.sin((m * Math.PI) / 2)
  }
  return { input, output, wet, mix }
}

export function buildEffect(ctx: BaseAudioContext, fx: Effect, bpm: number): FxNode {
  const P = fx.params
  switch (fx.type) {
    case 'eq': {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      const lo = ctx.createBiquadFilter()
      lo.type = 'lowshelf'
      lo.frequency.value = 110
      const mid = ctx.createBiquadFilter()
      mid.type = 'peaking'
      const hi = ctx.createBiquadFilter()
      hi.type = 'highshelf'
      hi.frequency.value = 7500
      hp.connect(lo).connect(mid).connect(hi)
      const set = (p: Record<string, number>) => {
        hp.frequency.value = p.hpf
        hp.Q.value = 0.7
        lo.gain.value = p.low
        mid.frequency.value = p.midf
        mid.gain.value = p.mid
        mid.Q.value = p.midq
        hi.gain.value = p.high
      }
      set(P)
      return { input: hp, output: hi, set, dispose: () => hi.disconnect() }
    }
    case 'comp': {
      const c = ctx.createDynamicsCompressor()
      const g = ctx.createGain()
      c.connect(g)
      const set = (p: Record<string, number>) => {
        c.threshold.value = p.threshold
        c.ratio.value = p.ratio
        c.attack.value = p.attack / 1000
        c.release.value = p.release / 1000
        c.knee.value = 6
        g.gain.value = dbg(p.makeup)
      }
      set(P)
      return { input: c, output: g, set, dispose: () => g.disconnect() }
    }
    case 'reverb': {
      const w = wetDry(ctx)
      const pre = ctx.createDelay(0.5)
      const conv = ctx.createConvolver()
      const tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      w.input.connect(pre).connect(conv).connect(tone).connect(w.wet)
      let size = -1
      let toneHz = -1
      const set = (p: Record<string, number>) => {
        pre.delayTime.value = p.predelay / 1000
        tone.frequency.value = p.tone
        if (Math.abs(p.size - size) > 0.05 || Math.abs(p.tone - toneHz) > 500) {
          size = p.size
          toneHz = p.tone
          conv.buffer = makeImpulse(ctx, p.size, p.tone)
        }
        w.mix(p.mix)
      }
      set(P)
      return { input: w.input, output: w.output, set, dispose: () => w.output.disconnect() }
    }
    case 'delay': {
      const w = wetDry(ctx)
      const d = ctx.createDelay(5)
      const fb = ctx.createGain()
      const tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      w.input.connect(d)
      d.connect(tone).connect(fb).connect(d)
      tone.connect(w.wet)
      const set = (p: Record<string, number>, tempo: number) => {
        d.delayTime.value = Math.min(4.9, (DELAY_DIVS[Math.round(p.div)] ?? 0.75) * (60 / tempo))
        fb.gain.value = p.feedback
        tone.frequency.value = p.tone
        w.mix(p.mix)
      }
      set(P, bpm)
      return { input: w.input, output: w.output, set, dispose: () => w.output.disconnect() }
    }
    case 'chorus': {
      const w = wetDry(ctx)
      const merger = ctx.createChannelMerger(2)
      const oscs: OscillatorNode[] = []
      const depths: GainNode[] = []
      ;[0.012, 0.019].forEach((base, i) => {
        const d = ctx.createDelay(0.1)
        d.delayTime.value = base
        const lfo = ctx.createOscillator()
        lfo.type = 'sine'
        const g = ctx.createGain()
        lfo.connect(g).connect(d.delayTime)
        w.input.connect(d)
        d.connect(merger, 0, i)
        lfo.start()
        oscs.push(lfo)
        depths.push(g)
      })
      merger.connect(w.wet)
      const set = (p: Record<string, number>) => {
        oscs.forEach((o, i) => (o.frequency.value = p.rate * (i ? 1.13 : 1)))
        depths.forEach((g) => (g.gain.value = p.depth / 1000))
        w.mix(p.mix)
      }
      set(P)
      return {
        input: w.input,
        output: w.output,
        set,
        dispose: () => {
          oscs.forEach((o) => o.stop())
          w.output.disconnect()
        },
      }
    }
    case 'drive': {
      const w = wetDry(ctx)
      const sh = ctx.createWaveShaper()
      sh.oversample = '2x'
      const tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      const out = ctx.createGain()
      w.input.connect(sh).connect(tone).connect(w.wet)
      w.output.connect(out)
      let drive = -1
      const set = (p: Record<string, number>) => {
        if (p.drive !== drive) {
          drive = p.drive
          sh.curve = shaperCurve(p.drive)
        }
        tone.frequency.value = p.tone
        out.gain.value = dbg(p.out)
        w.mix(p.mix)
      }
      set(P)
      return { input: w.input, output: out, set, dispose: () => out.disconnect() }
    }
    case 'filter': {
      const f = ctx.createBiquadFilter()
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      lfo.connect(depth).connect(f.frequency)
      lfo.start()
      const set = (p: Record<string, number>) => {
        f.type = (['lowpass', 'highpass', 'bandpass'] as const)[Math.round(p.mode)] ?? 'lowpass'
        f.frequency.value = p.freq
        f.Q.value = p.q
        lfo.frequency.value = p.rate
        depth.gain.value = p.lfo * p.freq * 0.85
      }
      set(P)
      return {
        input: f,
        output: f,
        set,
        dispose: () => {
          lfo.stop()
          f.disconnect()
        },
      }
    }
    case 'tremolo': {
      const g = ctx.createGain()
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      lfo.connect(depth).connect(g.gain)
      lfo.start()
      const set = (p: Record<string, number>) => {
        lfo.frequency.value = p.rate
        g.gain.value = 1 - p.depth / 2
        depth.gain.value = p.depth / 2
      }
      set(P)
      return {
        input: g,
        output: g,
        set,
        dispose: () => {
          lfo.stop()
          g.disconnect()
        },
      }
    }
    case 'lofi': {
      const w = wetDry(ctx)
      const sh = ctx.createWaveShaper()
      const tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      w.input.connect(sh).connect(tone).connect(w.wet)
      let bits = -1
      const set = (p: Record<string, number>) => {
        if (p.bits !== bits) {
          bits = p.bits
          sh.curve = crushCurve(p.bits)
        }
        tone.frequency.value = p.tone
        w.mix(p.mix)
      }
      set(P)
      return { input: w.input, output: w.output, set, dispose: () => w.output.disconnect() }
    }
  }
}
