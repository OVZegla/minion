import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { link } from '../../db/links'
import type { Thought } from '../../db/types'
import { Icon } from '../../components/Icon'
import { LinkPicker } from '../../components/Linked'
import { Menu, Modal, useUI } from '../../components/ui'
import { captureIdea } from '../notes/api'
import { relative } from '../../lib/dates'
import './thoughts.css'

const TINTS = ['#fbf1c7', '#f6dfe0', '#e3ebdf', '#e8e3f3', '#dfe8ef', '#f4e2d8']

/** Pensées à plat : déposer librement, organiser plus tard (ou jamais). */
export function ThoughtsPage() {
  const navigate = useNavigate()
  const { toast, confirm } = useUI()
  const thoughts = useLiveQuery(() => db.thoughts.orderBy('createdAt').reverse().toArray(), []) ?? []
  const [text, setText] = useState('')
  const [group, setGroup] = useState<string | 'all'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [groupModal, setGroupModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [wishFor, setWishFor] = useState<Thought | null>(null)

  const groups = useMemo(() => [...new Set(thoughts.map((t) => t.group).filter(Boolean) as string[])], [thoughts])
  const shown = thoughts.filter((t) => group === 'all' || (group === '' ? !t.group : t.group === group))

  const add = async () => {
    if (!text.trim()) return
    await db.thoughts.add({ ...base(), text: text.trim(), group: group !== 'all' && group ? group : null, color: TINTS[thoughts.length % TINTS.length] })
    setText('')
  }

  const applyGroup = async () => {
    const g = groupName.trim() || null
    await Promise.all(selected.map((id) => db.thoughts.update(id, { group: g, updatedAt: Date.now() })))
    setSelected([])
    setGroupModal(false)
    setGroupName('')
    toast(g ? `Regroupées dans « ${g} »` : 'Retirées de leur groupe')
  }

  const toNote = async (t: Thought) => {
    const n = await captureIdea(t.text, { inbox: false })
    toast('Note créée', { action: { label: 'Ouvrir', run: () => navigate(`/notes/${n.id}`) } })
    await keepOrRemove(t)
  }
  const toTask = async (t: Thought) => {
    await db.tasks.add({ ...base(), title: t.text.slice(0, 200), done: false, date: null, projectId: null, order: Date.now() })
    toast('Tâche ajoutée (sans date)')
    await keepOrRemove(t)
  }
  const toWish = async (t: Thought) => {
    const w = { ...base(), title: t.text.split('\n')[0].slice(0, 120), description: t.text.split('\n').slice(1).join('\n'), category: 'Rêve', state: 'someday' as const, order: await db.wishes.count() }
    await db.wishes.add(w)
    toast('Envie inscrite sur ton parchemin', { action: { label: 'Voir', run: () => navigate(`/parchemin?envie=${w.id}`) } })
    await keepOrRemove(t)
  }
  const toProject = async (t: Thought) => {
    const p = { ...base(), title: t.text.split('\n')[0].slice(0, 120), intention: t.text, status: 'idee', order: await db.projects.count(), cover: null }
    await db.projects.add(p)
    await keepOrRemove(t)
    navigate(`/projets/${p.id}`)
  }
  const keepOrRemove = async (t: Thought) => {
    if (await confirm({ title: 'Retirer la pensée d’ici ?', message: 'Elle a été transformée. Tu peux aussi la laisser dans tes pensées.', confirmLabel: 'Retirer d’ici' })) await db.thoughts.delete(t.id)
  }

  return (
    <div className="page thoughts-page">
      <div className="page-head">
        <div>
          <h1>Pensées à plat</h1>
          <p className="sub">Dépose ici ce qui te traverse l’esprit. Rien n’a besoin d’être rangé.</p>
        </div>
      </div>

      <div className="thought-input card">
        <textarea
          placeholder="Ce qui me trotte dans la tête…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              add()
            }
          }}
        />
        <div className="row">
          <span className="faint" style={{ fontSize: '0.78rem' }}>
            Entrée pour déposer · Maj+Entrée pour aller à la ligne
          </span>
          <span className="spacer" />
          <button className="btn primary sm" onClick={add} disabled={!text.trim()}>
            Déposer
          </button>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6, margin: '22px 0 16px' }}>
        <button className={`chip ${group === 'all' ? 'active' : 'neutral'}`} onClick={() => setGroup('all')}>
          Toutes · {thoughts.length}
        </button>
        {groups.map((g) => (
          <button key={g} className={`chip ${group === g ? 'active' : 'neutral'}`} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
        {groups.length > 0 && (
          <button className={`chip ${group === '' ? 'active' : 'neutral'}`} onClick={() => setGroup('')}>
            Sans groupe
          </button>
        )}
        <span className="spacer" />
        {selected.length > 0 && (
          <>
            <span className="faint" style={{ fontSize: '0.85rem' }}>
              {selected.length} sélectionnée{selected.length > 1 ? 's' : ''}
            </span>
            <button className="btn sm" onClick={() => setGroupModal(true)}>
              Regrouper
            </button>
            <button className="btn ghost sm" onClick={() => setSelected([])}>
              Annuler
            </button>
          </>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <span className="hand">L’esprit léger</span>
          Rien pour l’instant.
        </div>
      ) : (
        <div className="thoughts">
          {shown.map((t, i) => {
            const sel = selected.includes(t.id)
            return (
              <div key={t.id} className={`thought ${sel ? 'sel' : ''}`} style={{ background: t.color ?? TINTS[0], animationDelay: `${Math.min(i, 15) * 30}ms` }}>
                <button className={`thought-select ${sel ? 'on' : ''}`} aria-label="Sélectionner" onClick={() => setSelected(sel ? selected.filter((x) => x !== t.id) : [...selected, t.id])}>
                  {sel && <Icon name="check" size={11} strokeWidth={2.6} />}
                </button>
                <p className="thought-text">{t.text}</p>
                <div className="thought-foot">
                  {t.group && <span className="thought-group">{t.group}</span>}
                  <span className="faint">{relative(t.createdAt)}</span>
                  <span className="spacer" />
                  <Menu
                    trigger={
                      <button className="btn ghost icon sm" aria-label="Que faire de cette pensée ?">
                        <Icon name="more" size={16} />
                      </button>
                    }
                    items={[
                      { label: 'En faire une note', icon: 'book', onClick: () => toNote(t) },
                      { label: 'En faire une tâche', icon: 'check', onClick: () => toTask(t) },
                      { label: 'En faire une envie', icon: 'scroll', onClick: () => toWish(t) },
                      { label: 'En faire un projet', icon: 'kanban', onClick: () => toProject(t) },
                      { label: 'Associer à une envie', icon: 'link', onClick: () => setWishFor(t) },
                      { label: 'Changer de couleur', icon: 'palette', onClick: () => db.thoughts.update(t.id, { color: TINTS[(TINTS.indexOf(t.color ?? TINTS[0]) + 1) % TINTS.length] }) },
                      { label: 'Effacer', icon: 'trash', danger: true, onClick: () => db.thoughts.delete(t.id) },
                    ]}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={groupModal}
        onClose={() => setGroupModal(false)}
        title="Regrouper ces pensées"
        width={400}
        footer={
          <>
            <button className="btn ghost" onClick={() => setGroupModal(false)}>
              Annuler
            </button>
            <button className="btn primary" onClick={applyGroup}>
              Regrouper
            </button>
          </>
        }
      >
        <input className="input" autoFocus list="thought-groups" placeholder="Nom du groupe (vide pour retirer)" value={groupName} onChange={(e) => setGroupName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyGroup()} />
        <datalist id="thought-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </Modal>

      <LinkPicker
        open={!!wishFor}
        onClose={() => setWishFor(null)}
        types={['wish']}
        title="Associer à une envie"
        onPick={async (w) => {
          if (!wishFor) return
          // la pensée devient une note reliée à l'envie choisie
          const n = await captureIdea(wishFor.text, { inbox: false })
          await link('note', n.id, 'wish', w.id)
          toast(`Ajoutée aux inspirations de « ${w.title} »`)
          await keepOrRemove(wishFor)
        }}
      />
    </div>
  )
}
