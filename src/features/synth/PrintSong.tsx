import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Song } from '../../db/types'
import { Modal } from '../../components/ui'
import { KeyboardMarksView, NoteGridView, StaffView } from './views'

type Format = 'grid' | 'keys' | 'staff'
const FORMAT_LABEL: Record<Format, string> = { grid: 'Grille de notes', keys: 'Repères clavier', staff: 'Partition sur portée' }

interface Opts {
  format: Format
  scale: number
  perLine: number
  fingers: boolean
  annotations: boolean
}

/** Export PDF / impression d'un morceau, au format choisi. */
export function PrintDialog({ song, onClose }: { song: Song; onClose: () => void }) {
  const [o, setO] = useState<Opts>({ format: 'staff', scale: 1, perLine: 4, fingers: true, annotations: true })
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!printing) return
    document.body.classList.add('printing-song')
    const done = () => {
      document.body.classList.remove('printing-song')
      setPrinting(false)
    }
    window.addEventListener('afterprint', done, { once: true })
    const t = window.setTimeout(() => window.print(), 150)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('afterprint', done)
      document.body.classList.remove('printing-song')
    }
  }, [printing])

  const content = <SongSheet song={song} o={o} />

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Imprimer ou enregistrer en PDF"
        width={900}
        footer={
          <>
            <span className="faint" style={{ fontSize: '0.8rem', marginRight: 'auto', alignSelf: 'center' }}>
              Dans la fenêtre d’impression, choisis « Enregistrer au format PDF » pour obtenir un fichier.
            </span>
            <button className="btn ghost" onClick={onClose}>Fermer</button>
            <button className="btn primary" onClick={() => setPrinting(true)}>Imprimer / PDF</button>
          </>
        }
      >
        <div className="sp-opts">
          <div>
            <span className="label">Format</span>
            <div className="seg">
              {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
                <button key={f} className={o.format === f ? 'on' : ''} onClick={() => setO({ ...o, format: f })}>
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="label">Taille des notes et du texte</span>
            <input type="range" min={0.7} max={1.8} step={0.1} value={o.scale} onChange={(e) => setO({ ...o, scale: +e.target.value })} />
            <span className="faint"> {Math.round(o.scale * 100)} %</span>
          </label>
          {o.format !== 'keys' && (
            <label>
              <span className="label">Mesures par ligne</span>
              <select className="select" style={{ width: 90 }} value={o.perLine} onChange={(e) => setO({ ...o, perLine: +e.target.value })}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
          )}
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={o.fingers} onChange={(e) => setO({ ...o, fingers: e.target.checked })} /> Doigtés
          </label>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={o.annotations} onChange={(e) => setO({ ...o, annotations: e.target.checked })} /> Annotations
          </label>
        </div>
        <div className="sp-preview">{content}</div>
      </Modal>
      {printing && createPortal(<div className="print-root">{content}</div>, document.body)}
    </>
  )
}

export function SongSheet({ song, o }: { song: Song; o: Opts }) {
  const empty = new Set<string>()
  const common = { song, playhead: null, playing: empty, perLine: o.perLine, scale: o.scale, showFingers: o.fingers, showAnnotations: o.annotations, print: true }
  return (
    <div className="song-sheet">
      <header className="song-sheet-head">
        <h1>{song.title || 'Sans titre'}</h1>
        <div className="song-sheet-meta">
          <span>♩ = {song.bpm}</span>
          <span>Mesure {song.timeSig.join('/')}</span>
          <span>{song.measures} mesures</span>
          <span>{FORMAT_LABEL[o.format]}</span>
        </div>
      </header>
      {o.format === 'grid' && <NoteGridView {...common} />}
      {o.format === 'keys' && <KeyboardMarksView {...common} />}
      {o.format === 'staff' && <StaffView {...common} />}
    </div>
  )
}
