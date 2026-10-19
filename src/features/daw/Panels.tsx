import { useState } from 'react'
import { soundEmoji } from './bank'
import { Fader, fmtDb, Knob, Meter } from './controls'
import { FX_DEFS, FX_PRESETS, fxDef, newEffect } from './fx'
import { Wave, type Update } from './Arrange'
import type { Clip, DawProject, Effect, Track } from './types'
import { bufferToWav, download, encodeWav } from './wav'
import { loadAudio } from './engine'

const uid = () => crypto.randomUUID()

/* =====================================================================
   Mixeur
   ===================================================================== */

export function Mixer({ project: p, update, onFx, selTrack, setSelTrack }: { project: DawProject; update: Update; onFx: (target: string) => void; selTrack: string | null; setSelTrack: (id: string) => void }) {
  const setT = (id: string, patch: Partial<Track>, merge?: string) => update((pp) => ({ ...pp, tracks: pp.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), merge)
  return (
    <div className="mx">
      <div className="mx-strips">
        {p.tracks.map((t) => (
          <div key={t.id} className={`mx-strip ${selTrack === t.id ? 'sel' : ''}`} style={{ ['--c' as string]: t.color }} onPointerDown={() => setSelTrack(t.id)}>
            <div className="mx-name" title={t.name}>
              <span>{t.kind === 'audio' ? '🎙️' : soundEmoji(t.instrument)}</span> {t.name}
            </div>
            <button className="mx-fx" onClick={() => onFx(t.id)} title="Effets de la piste">
              {t.fx.length ? t.fx.map((f) => <i key={f.id} className={f.on ? 'on' : ''} title={fxDef(f.type).name}>{fxDef(f.type).emoji}</i>) : <span>+ effets</span>}
            </button>
            <div className="mx-knobs">
              <Knob label="Pan" value={t.pan} min={-1} max={1} def={0} bipolar size={34} format={(v) => (Math.abs(v) < 0.02 ? 'C' : v < 0 ? `G${Math.round(-v * 100)}` : `D${Math.round(v * 100)}`)} onChange={(v) => setT(t.id, { pan: v }, `pan-${t.id}`)} />
              <Knob label="Réverbe" value={t.send} min={0} max={1} def={0.1} size={34} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setT(t.id, { send: v }, `send-${t.id}`)} color="#7fb8e0" />
            </div>
            <div className="mx-fader-row">
              <Fader value={t.volume} onChange={(v) => setT(t.id, { volume: v }, `vol-${t.id}`)} />
              <Meter id={t.id} vertical />
            </div>
            <div className="mx-db">{fmtDb(t.volume)} dB</div>
            <div className="mx-btns">
              <button className={`th-b m ${t.mute ? 'on' : ''}`} onClick={() => setT(t.id, { mute: !t.mute })}>
                M
              </button>
              <button className={`th-b s ${t.solo ? 'on' : ''}`} onClick={() => setT(t.id, { solo: !t.solo })}>
                S
              </button>
              <button className={`th-b r ${t.arm ? 'on' : ''}`} onClick={() => setT(t.id, { arm: !t.arm })}>
                ●
              </button>
            </div>
          </div>
        ))}
        {p.tracks.length === 0 && <div className="dw-empty">Aucune piste pour l’instant.</div>}
      </div>
      <div className="mx-strip master">
        <div className="mx-name">Master</div>
        <button className="mx-fx" onClick={() => onFx('master')} title="Effets du master">
          {p.masterFx.length ? p.masterFx.map((f) => <i key={f.id} className={f.on ? 'on' : ''}>{fxDef(f.type).emoji}</i>) : <span>+ effets</span>}
        </button>
        <div className="mx-knobs">
          <Knob label="Salle" value={p.reverbSize} min={0} max={1} def={0.45} size={34} format={(v) => `${(0.8 + v * 4.5).toFixed(1)} s`} onChange={(v) => update((pp) => ({ ...pp, reverbSize: v }), 'rev-size')} color="#7fb8e0" />
        </div>
        <div className="mx-fader-row">
          <Fader value={p.masterVolume} onChange={(v) => update((pp) => ({ ...pp, masterVolume: v }), 'master-vol')} />
          <Meter id="L" vertical />
          <Meter id="R" vertical />
        </div>
        <div className="mx-db">{fmtDb(p.masterVolume)} dB</div>
      </div>
    </div>
  )
}

/* =====================================================================
   Rack d'effets
   ===================================================================== */

export function FxRack({ project: p, target, setTarget, update }: { project: DawProject; target: string; setTarget: (t: string) => void; update: Update }) {
  const [adding, setAdding] = useState(false)
  const [presets, setPresets] = useState(false)
  const track = p.tracks.find((t) => t.id === target)
  const chain = target === 'master' ? p.masterFx : track?.fx ?? []
  const setChain = (fx: Effect[], merge?: string) =>
    update((pp) => (target === 'master' ? { ...pp, masterFx: fx } : { ...pp, tracks: pp.tracks.map((t) => (t.id === target ? { ...t, fx } : t)) }), merge)
  const setFx = (id: string, patch: Partial<Effect>, merge?: string) => setChain(chain.map((f) => (f.id === id ? { ...f, ...patch } : f)), merge)

  return (
    <div className="fx">
      <div className="fx-head">
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="dw-select">
          {p.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="master">Master</option>
        </select>
        <div className="fx-add-wrap">
          <button className="dw-btn accent" onClick={() => setAdding((a) => !a)}>
            + Ajouter un effet
          </button>
          {adding && (
            <div className="dw-menu" onMouseLeave={() => setAdding(false)}>
              {FX_DEFS.map((d) => (
                <button
                  key={d.type}
                  onClick={() => {
                    setAdding(false)
                    setChain([...chain, newEffect(d.type)])
                  }}
                >
                  {d.emoji} {d.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="fx-add-wrap">
          <button className="dw-btn" onClick={() => setPresets((a) => !a)}>
            Préréglages
          </button>
          {presets && (
            <div className="dw-menu" onMouseLeave={() => setPresets(false)}>
              {FX_PRESETS.filter((x) => x.for === 'tout' || (track?.kind === 'audio' ? x.for === 'voix' : x.for === 'instrument' || target === 'master')).map((pr) => (
                <button
                  key={pr.name}
                  onClick={() => {
                    setPresets(false)
                    setChain(pr.chain())
                  }}
                >
                  {pr.name}
                </button>
              ))}
              {chain.length > 0 && (
                <button className="danger" onClick={() => (setPresets(false), setChain([]))}>
                  Tout retirer
                </button>
              )}
            </div>
          )}
        </div>
        <span className="dw-hint">Glisser les boutons vers le haut ou le bas · double-clic : valeur par défaut · Maj : réglage fin</span>
      </div>
      <div className="fx-chain">
        {chain.length === 0 && <div className="dw-empty">Pas encore d’effet. Commence par un préréglage, ou ajoute un égaliseur, un compresseur, une réverbe…</div>}
        {chain.map((f, i) => {
          const d = fxDef(f.type)
          return (
            <div key={f.id} className={`fx-card ${f.on ? '' : 'off'}`}>
              <div className="fx-card-head">
                <button className={`fx-power ${f.on ? 'on' : ''}`} onClick={() => setFx(f.id, { on: !f.on })} title={f.on ? 'Désactiver' : 'Activer'} />
                <b>
                  {d.emoji} {d.name}
                </b>
                <span className="dw-spacer" />
                <button className="fx-mini" disabled={i === 0} onClick={() => setChain(swap(chain, i, i - 1))} title="Avant">
                  ◀
                </button>
                <button className="fx-mini" disabled={i === chain.length - 1} onClick={() => setChain(swap(chain, i, i + 1))} title="Après">
                  ▶
                </button>
                <button className="fx-mini" onClick={() => setChain(chain.filter((x) => x.id !== f.id))} title="Retirer">
                  ✕
                </button>
              </div>
              <div className="fx-params">
                {d.params.map((prm) =>
                  prm.options ? (
                    <label key={prm.key} className="fx-opt">
                      <span>{prm.label}</span>
                      <select className="dw-select" value={Math.round(f.params[prm.key] ?? prm.def)} onChange={(e) => setFx(f.id, { params: { ...f.params, [prm.key]: +e.target.value } })}>
                        {prm.options.map((o, k) => (
                          <option key={o} value={k}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <Knob
                      key={prm.key}
                      label={prm.label}
                      value={f.params[prm.key] ?? prm.def}
                      min={prm.min}
                      max={prm.max}
                      def={prm.def}
                      log={prm.log}
                      step={prm.step}
                      bipolar={prm.min < 0 && prm.max > 0}
                      format={(v) => fmtParam(v, prm.unit)}
                      onChange={(v) => setFx(f.id, { params: { ...f.params, [prm.key]: v } }, `fx-${f.id}-${prm.key}`)}
                    />
                  ),
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function swap<T>(a: T[], i: number, j: number) {
  const b = [...a]
  ;[b[i], b[j]] = [b[j], b[i]]
  return b
}

function fmtParam(v: number, unit?: string) {
  if (unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`
  if (unit === 'dB') return `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`
  if (unit === 'ms') return `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`
  if (unit === 's') return `${v.toFixed(1)} s`
  if (unit === ':1') return `${v.toFixed(1)}:1`
  if (unit === 'q') return `Q ${v.toFixed(1)}`
  if (!unit && v <= 1 && v >= 0) return `${Math.round(v * 100)}%`
  return `${Math.round(v * 10) / 10}${unit ?? ''}`
}

/* =====================================================================
   Clip audio
   ===================================================================== */

export function AudioClipPanel({ clip, track, bpm, update, playhead }: { clip: Clip; track: Track; bpm: number; update: Update; playhead: () => number }) {
  const setC = (patch: Partial<Clip>, merge?: string) => update((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, clips: t.clips.map((c) => (c.id === clip.id ? { ...c, ...patch } : c)) } : t)) }), merge)
  const normalize = async () => {
    const b = await loadAudio(clip.audioId!)
    if (!b) return
    const sr = b.sampleRate
    const a = Math.floor((clip.offset ?? 0) * sr)
    const z = Math.min(b.length, a + Math.floor((clip.duration ?? 0) * sr))
    let m = 0
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c)
      for (let i = a; i < z; i++) m = Math.max(m, Math.abs(d[i]))
    }
    if (m > 0) setC({ gain: Math.round(20 * Math.log10(0.89 / m) * 10) / 10 })
  }
  const exportClip = async () => {
    const b = await loadAudio(clip.audioId!)
    if (!b) return
    const sr = b.sampleRate
    const a = Math.floor((clip.offset ?? 0) * sr)
    const z = Math.min(b.length, a + Math.floor((clip.duration ?? 0) * sr))
    const chans = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i).slice(a, z))
    download(encodeWav(chans, sr), `${clip.name || 'prise'}.wav`)
  }
  void bufferToWav
  const secs = clip.duration ?? 0
  return (
    <div className="acp">
      <div className="acp-wave" style={{ ['--c' as string]: track.color }}>
        <Wave audioId={clip.audioId!} offset={clip.offset ?? 0} duration={secs} width={1400} height={120} color={track.color} />
      </div>
      <div className="acp-ctrls">
        <label className="dw-field">
          Nom
          <input className="dw-input" value={clip.name} onChange={(e) => setC({ name: e.target.value }, `cname-${clip.id}`)} onKeyDown={(e) => e.stopPropagation()} />
        </label>
        <Knob label="Gain" value={clip.gain ?? 0} min={-24} max={18} def={0} step={0.5} bipolar format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={(v) => setC({ gain: v }, `cgain-${clip.id}`)} />
        <Knob label="Fondu entrée" value={clip.fadeIn ?? 0} min={0} max={Math.min(8, secs / 2)} def={0} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => setC({ fadeIn: v }, `cfi-${clip.id}`)} />
        <Knob label="Fondu sortie" value={clip.fadeOut ?? 0} min={0} max={Math.min(8, secs / 2)} def={0} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => setC({ fadeOut: v }, `cfo-${clip.id}`)} />
        <div className="acp-btns">
          <button className="dw-btn" onClick={normalize} title="Monte le volume au maximum sans saturer">
            Normaliser
          </button>
          <button
            className="dw-btn"
            onClick={() => {
              const at = playhead()
              const end = clip.start + (secs * bpm) / 60
              if (at <= clip.start || at >= end) return
              const first = ((at - clip.start) * 60) / bpm
              update((p) => ({
                ...p,
                tracks: p.tracks.map((t) =>
                  t.id === track.id ? { ...t, clips: [...t.clips.filter((c) => c.id !== clip.id), { ...clip, duration: first }, { ...clip, id: uid(), start: at, offset: (clip.offset ?? 0) + first, duration: secs - first }] } : t,
                ),
              }))
            }}
            title="Coupe la prise à l’endroit de la tête de lecture"
          >
            ✂ Couper ici
          </button>
          <button className="dw-btn" onClick={exportClip}>
            ⬇ Télécharger la prise
          </button>
        </div>
        <span className="dw-faint">
          {secs.toFixed(1)} s · décalage {(clip.offset ?? 0).toFixed(2)} s · les bords du clip se tirent dans l’arrangement
        </span>
      </div>
    </div>
  )
}
