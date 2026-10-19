/** Encode des canaux en WAV PCM 16 bits. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const nch = channels.length
  const len = channels[0]?.length ?? 0
  const bytes = 44 + len * nch * 2
  const buf = new ArrayBuffer(bytes)
  const v = new DataView(buf)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, bytes - 8, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, nch, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * nch * 2, true)
  v.setUint16(32, nch * 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, len * nch * 2, true)
  let o = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export const bufferToWav = (b: AudioBuffer) => encodeWav(Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)), b.sampleRate)

/** Crêtes (valeur absolue max) par tranche de 1/200 s, pour dessiner les formes d'onde. */
export interface Peaks {
  rate: number // tranches par seconde
  data: Float32Array
}
const peakCache = new Map<string, Peaks>()

export function peaksOf(id: string, b: AudioBuffer): Peaks {
  const hit = peakCache.get(id)
  if (hit) return hit
  const rate = 200
  const step = Math.max(1, Math.floor(b.sampleRate / rate))
  const n = Math.ceil(b.length / step)
  const data = new Float32Array(n)
  const chans = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))
  for (let i = 0; i < n; i++) {
    let m = 0
    const end = Math.min(b.length, (i + 1) * step)
    for (const ch of chans) for (let j = i * step; j < end; j += 2) {
      const a = Math.abs(ch[j])
      if (a > m) m = a
    }
    data[i] = m
  }
  const p = { rate: b.sampleRate / step, data }
  peakCache.set(id, p)
  return p
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}
