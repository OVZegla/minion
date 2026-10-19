import { useMemo, useState } from 'react'
import { CATEGORIES, INSTRUMENTS, KITS, type Category } from './bank'
import { LOOP_CATS, LOOPS, type LoopCat } from './patterns'
import type { Track } from './types'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Props {
  target: Track | null
  onPickSound: (id: string) => void
  onPickLoop: (id: string) => void
  onPreview: (id: string) => void
  onPreviewLoop: (id: string) => void
  onClose: () => void
}

export function Browser({ target, onPickSound, onPickLoop, onPreview, onPreviewLoop, onClose }: Props) {
  const [tab, setTab] = useState<'sons' | 'boucles'>('sons')
  const [cat, setCat] = useState<Category | null>(null)
  const [lcat, setLcat] = useState<LoopCat | null>(null)
  const [q, setQ] = useState('')

  const sounds = useMemo(() => {
    const all = [
      ...INSTRUMENTS.map((i) => ({ id: i.id, name: i.name, cat: i.cat as Category, bank: i.bank })),
      ...KITS.map((k) => ({ id: k.id, name: k.name, cat: 'Batteries' as Category, bank: k.bank })),
    ]
    const nq = norm(q.trim())
    return all.filter((s) => (!cat || s.cat === cat) && (!nq || norm(`${s.name} ${s.cat} ${s.bank}`).includes(nq)))
  }, [cat, q])

  const loops = useMemo(() => {
    const nq = norm(q.trim())
    return LOOPS.filter((l) => (!lcat || l.cat === lcat) && (!nq || norm(`${l.name} ${l.cat}`).includes(nq)))
  }, [lcat, q])

  const count = (c: Category) => (c === 'Batteries' ? KITS.length : INSTRUMENTS.filter((i) => i.cat === c).length)

  return (
    <aside className="br">
      <div className="br-head">
        <div className="dw-seg">
          <button className={tab === 'sons' ? 'on' : ''} onClick={() => setTab('sons')}>
            Sons ({INSTRUMENTS.length + KITS.length})
          </button>
          <button className={tab === 'boucles' ? 'on' : ''} onClick={() => setTab('boucles')}>
            Boucles ({LOOPS.length})
          </button>
        </div>
        <button className="th-more" onClick={onClose} aria-label="Fermer la banque">
          ✕
        </button>
      </div>
      <input className="dw-input br-search" placeholder={tab === 'sons' ? 'Chercher : piano, violon, 808…' : 'Chercher : trap, accords…'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      {tab === 'sons' && target && (
        <div className="br-target">
          Choisir un son pour <b>{target.name}</b>
          {target.kind === 'audio' && <small> (piste audio : un nouveau son créera une piste d’instrument)</small>}
        </div>
      )}
      {tab === 'sons' ? (
        <>
          <div className="br-cats">
            <button className={!cat ? 'on' : ''} onClick={() => setCat(null)}>
              Tout
            </button>
            {CATEGORIES.map((c) => (
              <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(cat === c.id ? null : c.id)} title={`${count(c.id)} sons`}>
                {c.emoji} {c.id}
              </button>
            ))}
          </div>
          <div className="br-list">
            {sounds.map((s) => (
              <div
                key={s.id}
                className={`br-item ${target?.instrument === s.id ? 'cur' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/minion-sound', s.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onPickSound(s.id)}
                title="Clic : choisir · glisser sur une piste"
              >
                <button
                  className="br-play"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPreview(s.id)
                  }}
                  aria-label="Écouter"
                >
                  ▶
                </button>
                <span className="br-emoji">{CATEGORIES.find((c) => c.id === s.cat)?.emoji}</span>
                <span className="br-name">
                  {s.name}
                  <small>{s.bank}</small>
                </span>
              </div>
            ))}
            {!sounds.length && <div className="dw-empty">Rien trouvé.</div>}
          </div>
          <p className="br-credits">
            Sons libres : General MIDI MusyngKite, VCSL (CC0), Splendid Grand Piano, Salamander, Greg Sullivan E-Pianos, tonejs-instruments, boîtes à rythmes de danigb/samples et Tone.js.
          </p>
        </>
      ) : (
        <>
          <div className="br-cats">
            <button className={!lcat ? 'on' : ''} onClick={() => setLcat(null)}>
              Tout
            </button>
            {LOOP_CATS.map((c) => (
              <button key={c.id} className={lcat === c.id ? 'on' : ''} onClick={() => setLcat(lcat === c.id ? null : c.id)}>
                {c.emoji} {c.id}
              </button>
            ))}
          </div>
          <div className="br-list">
            {loops.map((l) => (
              <div
                key={l.id}
                className="br-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/minion-loop', l.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onPickLoop(l.id)}
                title="Clic : ajouter à la tête de lecture · glisser sur une piste"
              >
                <button
                  className="br-play"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPreviewLoop(l.id)
                  }}
                  aria-label="Écouter"
                >
                  ▶
                </button>
                <span className="br-emoji">{LOOP_CATS.find((c) => c.id === l.cat)?.emoji}</span>
                <span className="br-name">
                  {l.name}
                  <small>
                    {l.cat} · {l.bars} mesure{l.bars > 1 ? 's' : ''} · {l.bpm} BPM
                  </small>
                </span>
              </div>
            ))}
          </div>
          <p className="br-credits">Les boucles sont des notes modifiables : elles suivent le tempo du morceau et s’ouvrent dans l’éditeur.</p>
        </>
      )}
    </aside>
  )
}
