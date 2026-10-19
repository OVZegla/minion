import { db } from '../../db/db'
import { getKit } from './bank'
import { buildEffect, makeImpulse, type FxNode } from './fx'
import { createInstrument, type Instrument, type Voice } from './instruments'
import { decodeBlob, setDecoder } from './samples'
import { beatsPerBar, clipEnd, projectEnd, type Clip, type DawProject, type Effect, type MidiNote, type Track } from './types'
import { encodeWav } from './wav'

const dbg = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20))

function softClipCurve() {
  const n = 8193
  const c = new Float32Array(n)
  const knee = 0.89
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const a = Math.abs(x)
    c[i] = a <= knee ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)) * 0.98)
  }
  return c
}

/* =====================================================================
   Graphe de mixage (utilisé en direct et pour l'export)
   ===================================================================== */

interface FxChain {
  key: string
  nodes: { fx: Effect; node: FxNode }[]
}

interface Strip {
  input: GainNode
  chain: FxChain
  fader: GainNode
  pan: StereoPannerNode
  send: GainNode
  analyser: AnalyserNode
  instrument: Instrument | null
  instId: string
}

const fxKey = (fx: Effect[]) => fx.map((f) => `${f.id}:${f.type}:${f.on ? 1 : 0}`).join('|')

function rewire(ctx: BaseAudioContext, from: AudioNode, to: AudioNode, chain: FxChain, fx: Effect[], bpm: number): FxChain {
  from.disconnect()
  for (const n of chain.nodes) {
    try {
      n.node.dispose()
    } catch {
      /* rien */
    }
  }
  const nodes = fx.filter((f) => f.on).map((f) => ({ fx: f, node: buildEffect(ctx, f, bpm) }))
  let head: AudioNode = from
  for (const n of nodes) {
    head.connect(n.node.input)
    head = n.node.output
  }
  head.connect(to)
  return { key: fxKey(fx), nodes }
}

function updateParams(chain: FxChain, fx: Effect[], bpm: number) {
  for (const n of chain.nodes) {
    const f = fx.find((x) => x.id === n.fx.id)
    if (f) n.node.set(f.params, bpm)
  }
}

export class Graph {
  readonly ctx: BaseAudioContext
  readonly masterIn: GainNode
  readonly masterGain: GainNode
  readonly out: GainNode
  readonly analyserL: AnalyserNode
  readonly analyserR: AnalyserNode
  private masterChain: FxChain = { key: '', nodes: [] }
  private reverbIn: GainNode
  private reverbConv: ConvolverNode
  private reverbSize = -1
  readonly strips = new Map<string, Strip>()
  audio = new Map<string, AudioBuffer>()
  private bpm = 120

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx
    this.masterIn = ctx.createGain()
    this.masterGain = ctx.createGain()
    // limiteur de sécurité : évite la saturation numérique sur le mix
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -1.5
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.12
    this.out = ctx.createGain()
    // écrêtage doux : transparent sous -1 dB, arrondi au-delà (jamais de saturation numérique)
    const clip = ctx.createWaveShaper()
    clip.curve = softClipCurve()
    this.masterGain.connect(limiter).connect(clip).connect(this.out)
    this.out.connect(dest)
    const split = ctx.createChannelSplitter(2)
    this.analyserL = ctx.createAnalyser()
    this.analyserR = ctx.createAnalyser()
    this.analyserL.fftSize = this.analyserR.fftSize = 1024
    this.out.connect(split)
    split.connect(this.analyserL, 0)
    split.connect(this.analyserR, 1)
    this.masterIn.connect(this.masterGain)
    // réverbe commune (bus d'envoi)
    this.reverbIn = ctx.createGain()
    this.reverbConv = ctx.createConvolver()
    const ret = ctx.createGain()
    ret.gain.value = 0.8
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 180
    this.reverbIn.connect(hp).connect(this.reverbConv).connect(ret).connect(this.masterIn)
  }

  private strip(t: Track): Strip {
    const ctx = this.ctx
    const s: Strip = {
      input: ctx.createGain(),
      chain: { key: '', nodes: [] },
      fader: ctx.createGain(),
      pan: ctx.createStereoPanner(),
      send: ctx.createGain(),
      analyser: ctx.createAnalyser(),
      instrument: null,
      instId: '',
    }
    s.analyser.fftSize = 512
    s.fader.connect(s.pan)
    s.pan.connect(this.masterIn)
    s.pan.connect(s.analyser)
    s.pan.connect(s.send).connect(this.reverbIn)
    s.chain = rewire(ctx, s.input, s.fader, s.chain, t.fx, this.bpm)
    this.strips.set(t.id, s)
    return s
  }

  /** Met le graphe en accord avec le projet (pistes, effets, volumes…). */
  sync(p: DawProject) {
    this.bpm = p.bpm
    const live = 'currentTime' in this.ctx ? this.ctx.currentTime : 0
    const anySolo = p.tracks.some((t) => t.solo)
    const set = (param: AudioParam, v: number) => {
      if (live > 0) param.setTargetAtTime(v, live, 0.015)
      else param.value = v
    }
    for (const t of p.tracks) {
      const s = this.strips.get(t.id) ?? this.strip(t)
      if (s.chain.key !== fxKey(t.fx)) s.chain = rewire(this.ctx, s.input, s.fader, s.chain, t.fx, p.bpm)
      else updateParams(s.chain, t.fx, p.bpm)
      const audible = !t.mute && (!anySolo || t.solo)
      set(s.fader.gain, audible ? dbg(t.volume) : 0)
      set(s.pan.pan, t.pan)
      set(s.send.gain, t.send)
      if (t.kind !== 'audio' && s.instId !== t.instrument) {
        s.instId = t.instrument
        s.instrument = createInstrument(t.instrument)
      }
    }
    for (const [id, s] of this.strips) {
      if (!p.tracks.some((t) => t.id === id)) {
        s.pan.disconnect()
        s.input.disconnect()
        this.strips.delete(id)
      }
    }
    if (this.masterChain.key !== fxKey(p.masterFx)) this.masterChain = rewire(this.ctx, this.masterIn, this.masterGain, this.masterChain, p.masterFx, p.bpm)
    else updateParams(this.masterChain, p.masterFx, p.bpm)
    set(this.masterGain.gain, dbg(p.masterVolume))
    if (Math.abs(p.reverbSize - this.reverbSize) > 0.02) {
      this.reverbSize = p.reverbSize
      this.reverbConv.buffer = makeImpulse(this.ctx, 0.8 + p.reverbSize * 4.5, 7000)
    }
  }

  /** Charge les sons nécessaires (notes jouées, fichiers audio). */
  async prepare(p: DawProject) {
    const jobs: Promise<unknown>[] = []
    for (const t of p.tracks) {
      const s = this.strips.get(t.id)
      if (!s) continue
      const pitches = new Set<number>()
      for (const c of t.clips) {
        if (c.audioId && !this.audio.has(c.audioId)) jobs.push(loadAudio(c.audioId).then((b) => b && this.audio.set(c.audioId!, b)))
        for (const n of c.notes ?? []) pitches.add(n.p)
      }
      if (s.instrument && pitches.size) jobs.push(s.instrument.prepare(pitches))
    }
    await Promise.all(jobs)
  }
}

/* ---------------- Lecture d'un clip audio ---------------- */

function playAudio(ctx: BaseAudioContext, dest: AudioNode, buf: AudioBuffer, clip: Clip, when: number, into: number, dur: number): Voice {
  const src = ctx.createBufferSource()
  src.buffer = buf
  const g = ctx.createGain()
  const level = dbg(clip.gain ?? 0)
  const D = clip.duration ?? buf.duration
  const fi = Math.max(0.003, clip.fadeIn ?? 0)
  const fo = Math.max(0.003, clip.fadeOut ?? 0)
  const at = (x: number) => level * Math.max(0, Math.min(1, x / fi, (D - x) / fo))
  g.gain.setValueAtTime(at(into), when)
  if (fi > into) g.gain.linearRampToValueAtTime(at(fi), when + (fi - into))
  const foStart = D - fo
  if (foStart > into && foStart < into + dur) {
    g.gain.setValueAtTime(at(foStart), when + (foStart - into))
    g.gain.linearRampToValueAtTime(0, when + (D - into))
  } else if (into + dur < D) {
    // coupé avant la fin (boucle) : petite fin douce
    g.gain.setValueAtTime(at(into + dur - 0.004), when + dur - 0.004)
    g.gain.linearRampToValueAtTime(0, when + dur)
  }
  src.connect(g).connect(dest)
  const offset = (clip.offset ?? 0) + into
  src.start(when, Math.max(0, offset), Math.max(0.001, dur))
  return {
    stop: (t) => {
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(0, t, 0.01)
      try {
        src.stop(t + 0.05)
      } catch {
        /* rien */
      }
    },
  }
}

interface ScheduleOpts {
  segEnd?: number
  midStart?: boolean // démarrer aussi les clips déjà en cours
  voices?: Set<Voice>
}

/** Programme tout ce qui commence entre les temps a et b (a joué à l'instant t0). */
function scheduleRange(g: Graph, p: DawProject, a: number, b: number, t0: number, o: ScheduleOpts) {
  const spb = 60 / p.bpm
  const limit = o.segEnd ?? Infinity
  for (const t of p.tracks) {
    const s = g.strips.get(t.id)
    if (!s) continue
    for (const c of t.clips) {
      if (c.muted) continue
      const ce = clipEnd(c, p.bpm)
      if (ce <= a || c.start >= b) continue
      if (c.audioId) {
        const buf = g.audio.get(c.audioId)
        if (!buf) continue
        let startBeat: number | null = null
        if (c.start >= a && c.start < b) startBeat = c.start
        else if (o.midStart && c.start < a && ce > a) startBeat = a
        if (startBeat === null) continue
        const end = Math.min(ce, limit)
        const dur = (end - startBeat) * spb
        if (dur <= 0.002) continue
        const v = playAudio(g.ctx, s.input, buf, c, t0 + (startBeat - a) * spb, (startBeat - c.start) * spb, dur)
        o.voices?.add(v)
      } else if (c.notes && s.instrument) {
        const len = c.length ?? 4
        for (const n of c.notes) {
          const ns = c.start + n.t
          if (ns < a || ns >= b || n.t >= len || n.t < 0) continue
          const ne = Math.min(ns + n.d, c.start + len, limit)
          const when = t0 + (ns - a) * spb
          const v = s.instrument.noteOn(g.ctx, s.input, n.p, n.v, when)
          if (v) {
            v.stop(t0 + (ne - a) * spb)
            o.voices?.add(v)
          }
        }
      }
    }
  }
}

/* ---------------- Fichiers audio du projet ---------------- */

const audioCache = new Map<string, Promise<AudioBuffer | null>>()
export function loadAudio(id: string): Promise<AudioBuffer | null> {
  let p = audioCache.get(id)
  if (!p) {
    p = db.dawAudio
      .get(id)
      .then((a) => (a ? decodeBlob(a.blob) : null))
      .catch(() => null)
    audioCache.set(id, p)
  }
  return p
}
export function cacheAudio(id: string, b: AudioBuffer) {
  audioCache.set(id, Promise.resolve(b))
}

/* =====================================================================
   Moteur en direct : transport, métronome, enregistrement
   ===================================================================== */

export type TransportState = 'stopped' | 'playing' | 'recording'

export interface RecordResult {
  trackId: string
  clip: Clip
}

const WORKLET = `
class MinionRec extends AudioWorkletProcessor {
  constructor() {
    super()
    this.rec = false
    this.buf = new Float32Array(16384)
    this.n = 0
    this.port.onmessage = (e) => {
      if (e.data === 'start') { this.rec = true; this.n = 0; this.port.postMessage({ type: 'first', frame: currentFrame }) }
      else if (e.data === 'stop') { this.flush(); this.rec = false; this.port.postMessage({ type: 'end' }) }
    }
  }
  flush() { if (this.n > 0) { this.port.postMessage({ type: 'data', data: this.buf.slice(0, this.n) }); this.n = 0 } }
  process(inputs) {
    if (this.rec) {
      const ch = inputs[0] && inputs[0][0]
      const len = ch ? ch.length : 128
      if (this.n + len > this.buf.length) this.flush()
      if (ch) this.buf.set(ch, this.n)
      else this.buf.fill(0, this.n, this.n + len)
      this.n += len
    }
    return true
  }
}
registerProcessor('minion-rec', MinionRec)
`

export class Engine {
  readonly ctx: AudioContext
  readonly graph: Graph
  private p: DawProject
  state: TransportState = 'stopped'
  loading = false
  liveAt = 0
  private anchors: { time: number; beat: number }[] = []
  private schedBeat = 0
  private schedTime = 0
  private midStart = true
  private timer = 0
  private voices = new Set<Voice>()
  private punchBeat = -Infinity
  private stopBeat = 0
  private listeners = new Set<() => void>()
  // entrée micro
  private mic: MediaStream | null = null
  private micSrc: MediaStreamAudioSourceNode | null = null
  private recNode: AudioWorkletNode | null = null
  private inputAnalyser: AnalyserNode | null = null
  private monitorTo: AudioNode | null = null
  private workletReady: Promise<void> | null = null
  private recChunks: Float32Array[] = []
  private recFirstFrame = 0
  private recEnd: (() => void) | null = null
  private recInfo: { tPunch: number; trackId: string | null; midi: Map<string, MidiNote[]> } | null = null
  private held = new Map<string, { voice: Voice | null; beat: number; v: number }>()
  inputDeviceId: string | undefined
  onRecorded: ((r: RecordResult[], audio: { id: string; blob: Blob; duration: number } | null) => void) | null = null
  private previewInst = new Map<string, Instrument>()
  private click: GainNode

  constructor(p: DawProject) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    setDecoder(this.ctx)
    this.p = p
    this.graph = new Graph(this.ctx, this.ctx.destination)
    this.click = this.ctx.createGain()
    this.click.gain.value = 0.5
    this.click.connect(this.ctx.destination)
    this.graph.sync(p)
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit() {
    for (const fn of this.listeners) fn()
  }

  get project() {
    return this.p
  }

  setProject(p: DawProject) {
    const prev = this.p
    this.p = p
    this.graph.sync(p)
    this.updateMonitor()
    if (this.state === 'playing' && (prev.bpm !== p.bpm || prev.loop.on !== p.loop.on || prev.loop.start !== p.loop.start || prev.loop.end !== p.loop.end)) {
      this.relocate(this.position())
    }
  }

  async prepare() {
    await this.graph.prepare(this.p)
  }

  /* ---------------- Position ---------------- */

  private now() {
    const ts = this.ctx.getOutputTimestamp?.()
    return ts?.contextTime && ts.contextTime > 0 ? ts.contextTime : this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0)
  }

  /** Temps (en noires) actuellement entendu. */
  position(): number {
    if (this.state === 'stopped' || !this.anchors.length) return this.stopBeat
    const now = this.now()
    let a = this.anchors[0]
    for (const x of this.anchors) if (x.time <= now) a = x
    const beat = a.beat + (Math.max(now, this.anchors[0].time) - a.time) / (60 / this.p.bpm)
    return beat
  }

  /** Position latence comprise (pour caler les notes jouées en direct). */
  private heardBeat() {
    return this.position()
  }

  /* ---------------- Transport ---------------- */

  async play(from: number, preRoll = 0) {
    await this.ctx.resume()
    this.stopAll(this.ctx.currentTime)
    // on attend que les sons soient téléchargés (la première fois seulement)
    let ready = false
    const prep = this.prepare().then(() => (ready = true))
    const slow = setTimeout(() => {
      if (!ready) {
        this.loading = true
        this.emit()
      }
    }, 250)
    await Promise.race([prep, new Promise((r) => setTimeout(r, 20000))])
    clearTimeout(slow)
    if (this.loading) {
      this.loading = false
      this.emit()
    }
    const t = this.ctx.currentTime + 0.08
    this.anchors = [{ time: t, beat: from - preRoll }]
    this.schedBeat = from - preRoll
    this.schedTime = t
    this.midStart = true
    if (this.state === 'stopped') this.state = 'playing'
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.tick(), 25)
    this.tick()
    this.emit()
  }

  private relocate(beat: number) {
    this.stopAll(this.ctx.currentTime)
    const t = this.ctx.currentTime + 0.05
    this.anchors = [{ time: t, beat }]
    this.schedBeat = beat
    this.schedTime = t
    this.midStart = true
    this.tick()
  }

  seek(beat: number) {
    this.stopBeat = Math.max(0, beat)
    if (this.state === 'playing') this.relocate(this.stopBeat)
    this.emit()
  }

  async stop() {
    if (this.state === 'stopped') return
    const pos = this.position()
    window.clearInterval(this.timer)
    this.stopAll(this.ctx.currentTime)
    const wasRec = this.state === 'recording'
    this.state = 'stopped'
    if (wasRec) await this.finishRecording(pos)
    this.anchors = []
    this.emit()
  }

  private stopAll(t: number) {
    for (const v of this.voices) v.stop(t)
    this.voices.clear()
  }

  private tick() {
    const p = this.p
    const horizon = this.ctx.currentTime + 0.16
    let guard = 0
    while (this.schedTime < horizon - 1e-4 && guard++ < 16) {
      const spb = 60 / p.bpm
      const looping = p.loop.on && this.state !== 'recording' && p.loop.end > p.loop.start + 0.24 && this.schedBeat < p.loop.end - 1e-6
      const segEnd = looping ? p.loop.end : Infinity
      const target = this.schedBeat + (horizon - this.schedTime) / spb
      if (target >= segEnd) {
        this.run(this.schedBeat, segEnd, this.schedTime, segEnd)
        this.schedTime += (segEnd - this.schedBeat) * spb
        this.schedBeat = p.loop.start
        this.anchors.push({ time: this.schedTime, beat: p.loop.start })
        this.midStart = true
      } else {
        this.run(this.schedBeat, target, this.schedTime, segEnd)
        this.schedBeat = target
        this.schedTime = horizon
      }
    }
    // ménage dans les repères passés
    const now = this.ctx.currentTime - 1
    while (this.anchors.length > 1 && this.anchors[1].time < now) this.anchors.shift()
    if (this.voices.size > 400) {
      const arr = [...this.voices]
      this.voices = new Set(arr.slice(-200))
    }
  }

  private run(a: number, b: number, t0: number, segEnd: number) {
    const p = this.p
    scheduleRange(this.graph, p, Math.max(a, -1e9), b, t0, { segEnd, midStart: this.midStart, voices: this.voices })
    this.midStart = false
    // métronome (et décompte avant l'enregistrement)
    const spb = 60 / p.bpm
    const bpb = beatsPerBar(p.timeSig)
    for (let k = Math.ceil(a - 1e-9); k < b; k++) {
      if (!(p.metronome || k < this.punchBeat)) continue
      const when = t0 + (k - a) * spb
      const rel = ((k % bpb) + bpb) % bpb
      this.tickSound(when, Math.abs(rel) < 1e-6, k < this.punchBeat)
    }
  }

  private tickSound(when: number, accent: boolean, countIn: boolean) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = accent ? 1760 : 1175
    o.type = countIn ? 'square' : 'sine'
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06)
    o.connect(g).connect(this.click)
    o.start(when)
    o.stop(when + 0.08)
  }

  /* ---------------- Notes jouées en direct ---------------- */

  noteOn(trackId: string, p: number, v = 0.8) {
    void this.ctx.resume()
    this.liveAt = performance.now()
    const s = this.graph.strips.get(trackId)
    if (!s?.instrument) return
    const key = `${trackId}:${p}`
    this.held.get(key)?.voice?.stop(this.ctx.currentTime)
    const voice = s.instrument.noteOn(this.ctx, s.input, p, v, this.ctx.currentTime + 0.005, true)
    this.held.set(key, { voice, beat: this.heardBeat(), v })
  }

  noteOff(trackId: string, p: number) {
    const key = `${trackId}:${p}`
    const h = this.held.get(key)
    if (!h) return
    this.held.delete(key)
    h.voice?.stop(this.ctx.currentTime)
    if (this.state === 'recording' && this.recInfo) {
      const t = this.p.tracks.find((x) => x.id === trackId)
      if (t?.arm && t.kind !== 'audio' && h.beat >= this.punchBeat - 0.25) {
        const list = this.recInfo.midi.get(trackId) ?? []
        const end = this.heardBeat()
        list.push({ id: crypto.randomUUID(), p, t: Math.max(0, h.beat - this.punchBeat), d: Math.max(0.0625, end - h.beat), v: h.v })
        this.recInfo.midi.set(trackId, list)
      }
    }
  }

  allNotesOff() {
    for (const [k] of this.held) {
      const [tid, p] = k.split(':')
      this.noteOff(tid, +p)
    }
  }

  /** Écoute d'un son de la banque. */
  async preview(soundId: string) {
    await this.ctx.resume()
    this.liveAt = performance.now()
    let inst = this.previewInst.get(soundId)
    if (!inst) {
      inst = createInstrument(soundId)
      this.previewInst.set(soundId, inst)
    }
    const kit = getKit(soundId)
    const t = this.ctx.currentTime + 0.05
    if (kit) {
      await inst.prepare([36, 38, 42, 46, 39])
      const seq = [36, 42, 38, 42, 36, 36, 38, 46]
      seq.forEach((p, i) => inst!.noteOn(this.ctx, this.graph.masterIn, p, 0.85, t + i * 0.18))
      return
    }
    const notes = [60, 64, 67, 72]
    await Promise.race([inst.prepare(notes), new Promise((r) => setTimeout(r, 4000))])
    const t2 = this.ctx.currentTime + 0.05
    notes.forEach((p, i) => inst!.noteOn(this.ctx, this.graph.masterIn, p, 0.75, t2 + i * 0.14)?.stop(t2 + 1.1))
  }

  /* ---------------- Entrée micro ---------------- */

  async enableInput(deviceId?: string) {
    if (this.mic && deviceId === this.inputDeviceId) return
    this.disableInput()
    this.inputDeviceId = deviceId
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.micSrc = this.ctx.createMediaStreamSource(this.mic)
    this.inputAnalyser = this.ctx.createAnalyser()
    this.inputAnalyser.fftSize = 1024
    this.micSrc.connect(this.inputAnalyser)
    if (!this.workletReady) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      this.workletReady = this.ctx.audioWorklet.addModule(url)
    }
    await this.workletReady
    this.recNode = new AudioWorkletNode(this.ctx, 'minion-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' })
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.micSrc.connect(this.recNode)
    this.recNode.connect(mute).connect(this.ctx.destination)
    this.recNode.port.onmessage = (e) => {
      const m = e.data
      if (m.type === 'first') this.recFirstFrame = m.frame
      else if (m.type === 'data') this.recChunks.push(m.data)
      else if (m.type === 'end') this.recEnd?.()
    }
    this.updateMonitor()
    this.emit()
  }

  disableInput() {
    this.mic?.getTracks().forEach((t) => t.stop())
    this.micSrc?.disconnect()
    this.recNode?.disconnect()
    this.mic = null
    this.micSrc = null
    this.recNode = null
    this.monitorTo = null
  }

  get inputOn() {
    return !!this.mic
  }

  private updateMonitor() {
    if (!this.micSrc) return
    const t = this.p.tracks.find((x) => x.kind === 'audio' && x.arm && x.monitor)
    const to = t ? this.graph.strips.get(t.id)?.input ?? null : null
    if (to === this.monitorTo) return
    if (this.monitorTo) {
      try {
        this.micSrc.disconnect(this.monitorTo)
      } catch {
        /* rien */
      }
    }
    if (to) this.micSrc.connect(to)
    this.monitorTo = to
  }

  private latency() {
    const out = this.ctx.outputLatency || this.ctx.baseLatency || 0.01
    const settings = this.mic?.getAudioTracks()[0]?.getSettings() as { latency?: number } | undefined
    const input = settings?.latency ?? 0.01
    return out + input + (this.p.latencyMs ?? 0) / 1000
  }

  /** Lance l'enregistrement : audio sur la piste audio armée, notes sur les pistes d'instrument armées. */
  async record(from: number) {
    const audioTrack = this.p.tracks.find((t) => t.arm && t.kind === 'audio')
    if (audioTrack) await this.enableInput(this.inputDeviceId)
    await this.ctx.resume()
    const preRoll = this.p.countIn * beatsPerBar(this.p.timeSig)
    this.punchBeat = from
    this.recChunks = []
    this.recInfo = { tPunch: 0, trackId: audioTrack?.id ?? null, midi: new Map() }
    this.state = 'recording'
    if (audioTrack && this.recNode) this.recNode.port.postMessage('start')
    await this.play(from, preRoll)
    this.recInfo.tPunch = this.anchors[0].time + preRoll * (60 / this.p.bpm)
  }

  private async finishRecording(stopPos: number) {
    const info = this.recInfo
    this.recInfo = null
    const punch = this.punchBeat
    this.punchBeat = -Infinity
    if (!info) return
    const results: RecordResult[] = []
    let audio: { id: string; blob: Blob; duration: number } | null = null
    if (info.trackId && this.recNode) {
      const done = new Promise<void>((r) => (this.recEnd = r))
      this.recNode.port.postMessage('stop')
      await Promise.race([done, new Promise((r) => setTimeout(r, 800))])
      this.recEnd = null
      const total = this.recChunks.reduce((n, c) => n + c.length, 0)
      const all = new Float32Array(total)
      let o = 0
      for (const c of this.recChunks) {
        all.set(c, o)
        o += c.length
      }
      this.recChunks = []
      const sr = this.ctx.sampleRate
      const firstTime = this.recFirstFrame / sr
      const offset = Math.max(0, info.tPunch + this.latency() - firstTime)
      const duration = total / sr - offset
      if (duration > 0.05) {
        const id = crypto.randomUUID()
        const blob = encodeWav([all], sr)
        const buf = this.ctx.createBuffer(1, total, sr)
        buf.copyToChannel(all, 0)
        this.graph.audio.set(id, buf)
        cacheAudio(id, buf)
        audio = { id, blob, duration: total / sr }
        results.push({ trackId: info.trackId, clip: { id: crypto.randomUUID(), start: punch, name: 'Prise', audioId: id, offset, duration, gain: 0, fadeIn: 0.005, fadeOut: 0.01 } })
      }
    }
    const bpb = beatsPerBar(this.p.timeSig)
    for (const [trackId, notes] of info.midi) {
      if (!notes.length) continue
      const len = Math.max(bpb, Math.ceil((stopPos - punch) / bpb) * bpb)
      results.push({ trackId, clip: { id: crypto.randomUUID(), start: punch, name: 'Prise', length: len, notes } })
    }
    if (results.length) this.onRecorded?.(results, audio)
  }

  /* ---------------- Mesures ---------------- */

  private buf = new Float32Array(1024)
  private peak(a: AnalyserNode) {
    const n = a.fftSize
    if (this.buf.length < n) this.buf = new Float32Array(n)
    const b = this.buf.subarray(0, n)
    a.getFloatTimeDomainData(b)
    let m = 0
    for (let i = 0; i < n; i++) {
      const v = Math.abs(b[i])
      if (v > m) m = v
    }
    return m
  }
  levels() {
    const tracks = new Map<string, number>()
    for (const [id, s] of this.graph.strips) tracks.set(id, this.peak(s.analyser))
    return {
      l: this.peak(this.graph.analyserL),
      r: this.peak(this.graph.analyserR),
      input: this.inputAnalyser ? this.peak(this.inputAnalyser) : 0,
      tracks,
    }
  }

  dispose() {
    window.clearInterval(this.timer)
    this.stopAll(this.ctx.currentTime)
    this.disableInput()
    void this.ctx.close()
  }
}

/* =====================================================================
   Export : rendu hors temps réel
   ===================================================================== */

export async function renderProject(p: DawProject, opts: { from?: number; to?: number; tail?: number; sampleRate?: number } = {}): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? 44100
  const from = opts.from ?? 0
  const to = opts.to ?? projectEnd(p)
  const spb = 60 / p.bpm
  const seconds = Math.max(0.5, (to - from) * spb + (opts.tail ?? 2.5))
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr)
  const g = new Graph(ctx, ctx.destination)
  g.sync(p)
  await g.prepare(p)
  scheduleRange(g, p, from, to, 0, { midStart: true, segEnd: to })
  return ctx.startRendering()
}
