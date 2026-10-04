import type { Song } from '../../db/types'
import { beatsPerMeasure, freq } from './music'

/** Petit synthé Web Audio : préécoute simple, honnête (pas un vrai piano). */
class SynthEngine {
  ctx: AudioContext | null = null
  master: GainNode | null = null

  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      const comp = this.ctx.createDynamicsCompressor()
      this.master.connect(comp).connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  /** Joue une note (son doux de synthé : triangle + sinus, filtre, enveloppe). */
  note(midi: number, when: number, dur: number, velocity = 0.8) {
    const ctx = this.ensure()
    const f = freq(midi)
    const out = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = Math.min(6000, f * 6)
    const o1 = ctx.createOscillator()
    o1.type = 'triangle'
    o1.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = f * 2
    const g2 = ctx.createGain()
    g2.gain.value = 0.18
    o1.connect(filter)
    o2.connect(g2).connect(filter)
    filter.connect(out).connect(this.master!)
    const peak = 0.32 * velocity
    const end = when + Math.max(0.08, dur)
    out.gain.setValueAtTime(0, when)
    out.gain.linearRampToValueAtTime(peak, when + 0.01)
    out.gain.exponentialRampToValueAtTime(peak * 0.55, when + 0.25)
    out.gain.setValueAtTime(peak * 0.55, end - 0.02)
    out.gain.exponentialRampToValueAtTime(0.0001, end + 0.25)
    o1.start(when)
    o2.start(when)
    o1.stop(end + 0.3)
    o2.stop(end + 0.3)
  }

  click(when: number, accent: boolean) {
    const ctx = this.ensure()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = accent ? 1600 : 1000
    g.gain.setValueAtTime(accent ? 0.35 : 0.2, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
    o.connect(g).connect(this.master!)
    o.start(when)
    o.stop(when + 0.06)
  }
}

export const synth = new SynthEngine()

export interface PlayOptions {
  fromBeat: number
  toBeat: number // fin (exclue)
  loop: boolean
  practiceBpm: number // tempo de pratique, sans toucher au tempo de référence
  metronome: boolean
  countIn: boolean
  mute?: { R?: boolean; L?: boolean }
}

/**
 * Lecteur avec planification anticipée (lookahead) : précis même si l'écran ralentit.
 * `position()` donne le temps courant (en noires) pour synchroniser le curseur.
 */
export class Player {
  private timer: number | null = null
  private startTime = 0 // temps audio correspondant à `opts.fromBeat`
  private nextBeatScheduled = 0
  private nextClick = 0
  private opts!: PlayOptions
  private song!: Song
  playing = false
  onEnd?: () => void

  start(song: Song, opts: PlayOptions) {
    this.stop()
    const ctx = synth.ensure()
    this.song = song
    this.opts = opts
    const spb = 60 / opts.practiceBpm
    const countBeats = opts.countIn ? beatsPerMeasure(song.timeSig) : 0
    this.startTime = ctx.currentTime + 0.12 + countBeats * spb
    this.nextBeatScheduled = opts.fromBeat
    this.nextClick = opts.fromBeat - countBeats
    this.playing = true
    this.tick()
    this.timer = window.setInterval(() => this.tick(), 25)
  }

  /** Change le tempo de pratique en cours de lecture, sans saut. */
  setTempo(bpm: number) {
    if (!this.playing) return
    const pos = this.position()
    this.opts = { ...this.opts, practiceBpm: bpm }
    const ctx = synth.ensure()
    this.startTime = ctx.currentTime - (pos - this.opts.fromBeat) * (60 / bpm)
  }

  private beatToTime(beat: number) {
    return this.startTime + (beat - this.opts.fromBeat) * (60 / this.opts.practiceBpm)
  }

  position(): number {
    if (!this.playing || !synth.ctx) return this.opts?.fromBeat ?? 0
    const t = synth.ctx.currentTime
    return this.opts.fromBeat + (t - this.startTime) / (60 / this.opts.practiceBpm)
  }

  private tick() {
    const ctx = synth.ctx!
    const horizon = ctx.currentTime + 0.15
    const { toBeat, loop, metronome } = this.opts
    const bpmMeasure = beatsPerMeasure(this.song.timeSig)
    // métronome (y compris décompte)
    while (this.beatToTime(this.nextClick) < horizon) {
      const b = this.nextClick
      if (b >= toBeat) break
      const isCount = b < this.opts.fromBeat
      if (metronome || isCount) {
        const t = this.beatToTime(b)
        if (t >= ctx.currentTime - 0.01) synth.click(t, Math.abs(b % bpmMeasure) < 1e-6 || (isCount && Math.abs((b - this.opts.fromBeat) % bpmMeasure) < 1e-6))
      }
      this.nextClick += 1
    }
    // notes
    const windowEnd = Math.min(toBeat, this.opts.fromBeat + (horizon - this.startTime) / (60 / this.opts.practiceBpm))
    if (windowEnd > this.nextBeatScheduled) {
      for (const n of this.song.notes) {
        if (this.opts.mute?.[n.hand]) continue
        if (n.start >= this.nextBeatScheduled - 1e-6 && n.start < windowEnd - 1e-6) {
          const dur = Math.min(n.dur, toBeat - n.start) * (60 / this.opts.practiceBpm)
          synth.note(n.pitch, this.beatToTime(n.start), dur * 0.95)
        }
      }
      this.nextBeatScheduled = windowEnd
    }
    // fin ou boucle
    if (this.position() >= toBeat) {
      if (loop) {
        const from = this.opts.fromBeat
        this.startTime = this.beatToTime(toBeat)
        this.nextBeatScheduled = from
        this.nextClick = from
        this.opts = { ...this.opts, countIn: false }
      } else {
        this.stop()
        this.onEnd?.()
      }
    }
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
    this.playing = false
  }
}
