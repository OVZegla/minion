import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { link, removeAllLinks } from '../../db/links'
import { pickFiles, saveAsset, useAssetUrl } from '../../db/assets'
import type { JournalEntry } from '../../db/types'
import { RichEditor } from '../../components/editor/RichEditor'
import { Icon } from '../../components/Icon'
import { LinkedItems } from '../../components/Linked'
import { Menu, SaveStatus, useAutosave, useUI } from '../../components/ui'
import { addDays, capitalize, fmtFullDate, parseYmd, ymd } from '../../lib/dates'
import { MOODS, QUESTIONS } from './meta'
import { openJournalDay } from './JournalPage'
import './journal.css'

export function JournalEntryPage() {
  const { id } = useParams()
  const e = useLiveQuery(() => db.journal.get(id!), [id])
  if (e === undefined) return null
  if (!e)
    return (
      <div className="page narrow empty">
        <span className="hand">Introuvable</span>Cette page n’existe plus.
      </div>
    )
  return <Entry key={e.id} initial={e} />
}

type Draft = Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt' | 'date'>

function Entry({ initial }: { initial: JournalEntry }) {
  const navigate = useNavigate()
  const { confirm, toast } = useUI()
  const [d, setD] = useState<Draft>({
    title: initial.title,
    content: initial.content,
    text: initial.text,
    mood: initial.mood,
    highlights: initial.highlights,
    prides: initial.prides,
    answers: initial.answers,
    photoIds: initial.photoIds,
    music: initial.music,
  })
  const [openQ, setOpenQ] = useState<string[]>(Object.keys(initial.answers).filter((k) => initial.answers[k]))
  const state = useAutosave(d, (v) => db.journal.update(initial.id, { ...v, updatedAt: Date.now() }))
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const date = parseYmd(initial.date)

  const remove = async () => {
    if (!(await confirm({ title: 'Effacer cette page ?', message: 'Cette page du journal sera effacée définitivement.', confirmLabel: 'Effacer définitivement', danger: true }))) return
    await removeAllLinks('journal', initial.id)
    await db.journal.delete(initial.id)
    navigate('/journal')
    toast('Page effacée')
  }

  return (
    <div className="page narrow journal-entry">
      <div className="row no-print" style={{ marginBottom: 18 }}>
        <button className="btn ghost sm" onClick={() => navigate('/journal')}>
          <Icon name="chevronLeft" size={16} /> Journal
        </button>
        <span className="spacer" />
        <SaveStatus state={state} />
        <button className="btn ghost icon sm" aria-label="Jour précédent" title="Jour précédent" onClick={() => openJournalDay(ymd(addDays(date, -1)), navigate)}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <button className="btn ghost icon sm" aria-label="Jour suivant" title="Jour suivant" disabled={initial.date >= ymd()} onClick={() => openJournalDay(ymd(addDays(date, 1)), navigate)}>
          <Icon name="chevronRight" size={16} />
        </button>
        <Menu
          trigger={
            <button className="btn ghost icon sm" aria-label="Plus d’options">
              <Icon name="more" size={18} />
            </button>
          }
          items={[
            { label: 'Imprimer / PDF', icon: 'printer', onClick: () => window.print() },
            { label: 'Effacer cette page', icon: 'trash', danger: true, onClick: remove },
          ]}
        />
      </div>

      <div className="journal-date">
        <span className="hand">{initial.date === ymd() ? 'aujourd’hui' : ''}</span>
        <h1>{capitalize(fmtFullDate(date))}</h1>
      </div>
      <input className="journal-title" placeholder="Un titre pour cette journée (facultatif)" value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} />

      <div className="journal-moods no-print">
        <span className="label" style={{ margin: 0 }}>
          Humeur, si tu veux
        </span>
        <div className="row wrap" style={{ gap: 6 }}>
          {MOODS.map((m) => (
            <button key={m.id} className={`mood ${d.mood === m.id ? 'on' : ''}`} onClick={() => set({ mood: d.mood === m.id ? null : m.id })} title={m.label}>
              <span>{m.emoji}</span>
              <small>{m.label}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="journal-paper">
        <RichEditor content={d.content} placeholder="Raconte ta journée, librement…" onChange={(content, text) => set({ content, text })} onLinkContent={(e) => link('journal', initial.id, e.type, e.id)} minimal />
      </div>

      <section className="journal-section">
        <h3>Questions, si elles t’inspirent</h3>
        <div className="row wrap" style={{ gap: 6, margin: '10px 0' }}>
          {QUESTIONS.filter((q) => !openQ.includes(q.id)).map((q) => (
            <button key={q.id} className="chip neutral" onClick={() => setOpenQ([...openQ, q.id])}>
              {q.q}
            </button>
          ))}
        </div>
        {QUESTIONS.filter((q) => openQ.includes(q.id)).map((q) => (
          <div key={q.id} className="journal-q">
            <div className="row">
              <label className="journal-q-label">{q.q}</label>
              <span className="spacer" />
              <button
                className="btn ghost icon sm"
                aria-label="Retirer la question"
                onClick={() => {
                  setOpenQ(openQ.filter((x) => x !== q.id))
                  const { [q.id]: _, ...rest } = d.answers
                  set({ answers: rest })
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <textarea className="textarea" value={d.answers[q.id] ?? ''} onChange={(e) => set({ answers: { ...d.answers, [q.id]: e.target.value } })} />
          </div>
        ))}
      </section>

      <div className="journal-two">
        <ListField title="Moments marquants" icon="✦" items={d.highlights} onChange={(highlights) => set({ highlights })} placeholder="Un moment à retenir…" />
        <ListField title="Petites fiertés" icon="★" items={d.prides} onChange={(prides) => set({ prides })} placeholder="Ce dont je suis fière…" />
      </div>

      <section className="journal-section">
        <div className="row">
          <h3>Photos</h3>
          <span className="spacer" />
          <button
            className="btn ghost sm"
            onClick={async () => {
              const files = await pickFiles('image/*', true)
              const ids = await Promise.all(files.map(saveAsset))
              set({ photoIds: [...d.photoIds, ...ids] })
            }}
          >
            <Icon name="plus" size={14} /> Ajouter
          </button>
        </div>
        {d.photoIds.length > 0 && (
          <div className="journal-photos">
            {d.photoIds.map((p, i) => (
              <JPhoto key={p} id={p} tilt={(i % 3) - 1} onRemove={() => set({ photoIds: d.photoIds.filter((x) => x !== p) })} />
            ))}
          </div>
        )}
      </section>

      <section className="journal-section">
        <h3>Musique ou lien du jour</h3>
        <input className="input" style={{ marginTop: 8 }} placeholder="Un morceau, une vidéo, un lien…" value={d.music ?? ''} onChange={(e) => set({ music: e.target.value })} />
        {d.music && /^https?:\/\//.test(d.music) && (
          <a href={d.music} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', display: 'inline-block', marginTop: 6 }}>
            Ouvrir le lien
          </a>
        )}
      </section>

      <section className="journal-section no-print">
        <LinkedItems type="journal" id={initial.id} title="Relié à" />
      </section>
    </div>
  )
}

function ListField({ title, icon, items, onChange, placeholder }: { title: string; icon: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    if (!draft.trim()) return
    onChange([...items, draft.trim()])
    setDraft('')
  }
  return (
    <div className="card pad">
      <h3 style={{ marginBottom: 10 }}>{title}</h3>
      {items.map((it, i) => (
        <div key={i} className="journal-li">
          <span className="journal-li-icon">{icon}</span>
          <span style={{ flex: 1 }}>{it}</span>
          <button className="btn ghost icon sm no-print" aria-label="Retirer" onClick={() => onChange(items.filter((_, k) => k !== i))}>
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <input className="input no-print" style={{ marginTop: 6 }} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} onBlur={add} />
    </div>
  )
}

function JPhoto({ id, tilt, onRemove }: { id: string; tilt: number; onRemove: () => void }) {
  const url = useAssetUrl(id)
  return (
    <div className="journal-photo" style={{ transform: `rotate(${tilt * 1.5}deg)` }}>
      {url && <img src={url} alt="" />}
      <button className="wish-photo-x no-print" onClick={onRemove} aria-label="Retirer la photo">
        <Icon name="x" size={12} />
      </button>
    </div>
  )
}
