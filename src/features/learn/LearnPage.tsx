import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { link, removeAllLinks } from '../../db/links'
import type { Deck } from '../../db/types'
import { Icon } from '../../components/Icon'
import { LinkPicker } from '../../components/Linked'
import { Menu, Modal, useUI } from '../../components/ui'
import { relative } from '../../lib/dates'
import './learn.css'

export function LearnPage() {
  const navigate = useNavigate()
  const { confirm } = useUI()
  const decks = useLiveQuery(() => db.decks.orderBy('updatedAt').reverse().toArray(), []) ?? []
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [noteIds, setNoteIds] = useState<{ id: string; title: string }[]>([])
  const [picking, setPicking] = useState(false)

  const create = async () => {
    const d: Deck = { ...base(), title: title.trim() || noteIds[0]?.title || 'Nouvelle série', topic: topic.trim(), noteIds: noteIds.map((n) => n.id), cards: [], deepen: [], summary: null }
    await db.decks.add(d)
    await Promise.all(noteIds.map((n) => link('deck', d.id, 'note', n.id)))
    setCreating(false)
    navigate(`/apprendre/${d.id}`)
  }

  const now = Date.now()
  const due = (d: Deck) => d.cards.filter((c) => c.dueAt <= now).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Apprendre</h1>
          <p className="sub">Réviser ce qui te passionne, à partir de tes propres notes : fiches, cartes, quiz, exercices.</p>
        </div>
        <span className="spacer" />
        <button
          className="btn primary"
          onClick={() => {
            setTitle('')
            setTopic('')
            setNoteIds([])
            setCreating(true)
          }}
        >
          <Icon name="plus" size={16} /> Nouvelle série
        </button>
      </div>

      {decks.length === 0 ? (
        <div className="empty">
          <span className="hand">Apprendre pour le plaisir</span>
          <p>Choisis une ou plusieurs notes (une technique de design, une idée business, un morceau…)</p>
          <p>et Minion t’aide à en faire des cartes et des petits exercices.</p>
        </div>
      ) : (
        <div className="decks">
          {decks.map((d) => {
            const n = due(d)
            const mastered = d.cards.filter((c) => c.box >= 3).length
            return (
              <article key={d.id} className="card hoverable deck-card" onClick={() => navigate(`/apprendre/${d.id}`)}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="eyebrow">{d.topic || 'Série'}</div>
                    <h3 style={{ marginTop: 4 }}>{d.title}</h3>
                  </div>
                  <Menu
                    trigger={
                      <button className="btn ghost icon sm" aria-label="Options">
                        <Icon name="more" size={16} />
                      </button>
                    }
                    items={[
                      {
                        label: 'Supprimer la série',
                        icon: 'trash',
                        danger: true,
                        onClick: async () => {
                          if (!(await confirm({ title: 'Supprimer cette série ?', message: 'Ses cartes seront effacées. Tes notes restent intactes.', confirmLabel: 'Supprimer', danger: true }))) return
                          await removeAllLinks('deck', d.id)
                          await db.decks.delete(d.id)
                        },
                      },
                    ]}
                  />
                </div>
                <div className="deck-stats">
                  <span>{d.cards.length} carte{d.cards.length > 1 ? 's' : ''}</span>
                  {d.cards.length > 0 && <span>{mastered} bien connue{mastered > 1 ? 's' : ''}</span>}
                  {d.deepen.filter((x) => !x.done).length > 0 && <span>{d.deepen.filter((x) => !x.done).length} à approfondir</span>}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="faint" style={{ fontSize: '0.78rem' }}>
                    {d.lastSessionAt ? `Révisé ${relative(d.lastSessionAt)}` : 'Pas encore révisé'}
                  </span>
                  <span className="spacer" />
                  {n > 0 && <span className="chip">{n} à revoir</span>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nouvelle série"
        width={520}
        footer={
          <>
            <button className="btn ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button className="btn primary" onClick={create}>Créer</button>
          </>
        }
      >
        <div className="field">
          <label className="label">Titre</label>
          <input className="input" autoFocus placeholder="Les bases de la typographie" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Sujet (facultatif)</label>
          <input className="input" placeholder="Design, business, musique…" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <label className="label">Notes sources</label>
        <div className="stack" style={{ gap: 4 }}>
          {noteIds.map((n) => (
            <div key={n.id} className="linked-item">
              <span className="linked-open" style={{ cursor: 'default' }}>
                <Icon name="book" size={15} /> <span className="linked-title">{n.title}</span>
              </span>
              <button className="btn ghost icon sm" aria-label="Retirer" onClick={() => setNoteIds(noteIds.filter((x) => x.id !== n.id))}>
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setPicking(true)}>
          <Icon name="plus" size={14} /> Choisir une note
        </button>
        <p className="faint" style={{ fontSize: '0.8rem', marginTop: 8 }}>Tu pourras aussi écrire tes cartes toi-même, sans note.</p>
      </Modal>
      <LinkPicker open={picking} onClose={() => setPicking(false)} types={['note']} title="Choisir une note" exclude={noteIds.map((n) => n.id)} onPick={(e) => setNoteIds([...noteIds, { id: e.id, title: e.title }])} />
    </div>
  )
}
