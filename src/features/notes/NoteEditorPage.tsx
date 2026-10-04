import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { link } from '../../db/links'
import type { Note } from '../../db/types'
import { RichEditor } from '../../components/editor/RichEditor'
import { CoverPicker, CoverView } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { LinkedItems } from '../../components/Linked'
import { TagInput } from '../../components/TagInput'
import { Menu, Modal, SaveStatus, useAutosave, useUI } from '../../components/ui'
import { fmtDay } from '../../lib/dates'
import { trashNote } from './api'
import './notes.css'

const ICONS = ['📝', '💡', '🎹', '🎨', '🏡', '💼', '🎬', '🍰', '🌿', '✈️', '📚', '✨', '🧵', '🌙', '☕', '🎧']

export function NoteEditorPage() {
  const { id } = useParams()
  const note = useLiveQuery(() => db.notes.get(id!), [id])
  if (note === undefined) return null
  if (!note)
    return (
      <div className="page narrow empty">
        <span className="hand">Introuvable</span>Cette note n’existe plus.
      </div>
    )
  return <NoteEditor key={note.id} initial={note} />
}

type Draft = Pick<Note, 'title' | 'content' | 'text' | 'icon' | 'cover' | 'folderId' | 'tags' | 'favorite' | 'inbox'>

function NoteEditor({ initial }: { initial: Note }) {
  const navigate = useNavigate()
  const { toast, confirm } = useUI()
  const [draft, setDraft] = useState<Draft>({
    title: initial.title,
    content: initial.content,
    text: initial.text,
    icon: initial.icon,
    cover: initial.cover,
    folderId: initial.folderId,
    tags: initial.tags,
    favorite: initial.favorite,
    inbox: initial.inbox,
  })
  const [coverOpen, setCoverOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const folders = useLiveQuery(() => db.folders.toArray(), []) ?? []
  const allTags = useLiveQuery(async () => [...new Set((await db.notes.toArray()).flatMap((n) => n.tags))], []) ?? []

  const state = useAutosave(draft, (d) => db.notes.update(initial.id, { ...d, updatedAt: Date.now() }))
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  useEffect(() => {
    db.notes.update(initial.id, { openedAt: Date.now() })
  }, [initial.id])

  const toWish = async () => {
    const w = { ...base(), title: draft.title || 'Nouvelle envie', description: draft.text.slice(0, 400), category: 'Rêve', state: 'someday' as const, order: await db.wishes.count() }
    await db.wishes.add(w)
    await link('note', initial.id, 'wish', w.id)
    toast('Envie inscrite sur ton parchemin, reliée à cette note', { action: { label: 'Voir', run: () => navigate(`/parchemin?envie=${w.id}`) } })
  }
  const toProject = async () => {
    const p = { ...base(), title: draft.title || 'Nouveau projet', intention: draft.text.slice(0, 300), status: 'idee', order: await db.projects.count(), cover: draft.cover ?? null }
    await db.projects.add(p)
    await link('note', initial.id, 'project', p.id)
    navigate(`/projets/${p.id}`)
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Mettre cette note à la corbeille ?', message: 'Tu pourras la restaurer depuis la corbeille de la bibliothèque.', confirmLabel: 'Mettre à la corbeille' }))) return
    await trashNote(initial.id)
    navigate('/notes')
    toast('Note mise à la corbeille')
  }

  return (
    <div className="note-page">
      <div className="note-topbar no-print">
        <button className="btn ghost sm" onClick={() => navigate(-1)}>
          <Icon name="chevronLeft" size={16} /> Retour
        </button>
        <span className="spacer" />
        <SaveStatus state={state} />
        <button className="btn ghost icon sm" aria-label={draft.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => set({ favorite: !draft.favorite })}>
          <Icon name="star" size={17} fill={draft.favorite ? 'var(--gold)' : 'none'} style={{ color: draft.favorite ? 'var(--gold)' : undefined }} />
        </button>
        <Menu
          trigger={
            <button className="btn ghost icon sm" aria-label="Plus d’options">
              <Icon name="more" size={18} />
            </button>
          }
          items={[
            { label: draft.cover ? 'Changer la couverture' : 'Ajouter une couverture', icon: 'image', onClick: () => setCoverOpen(true) },
            { label: 'Exporter en PDF', icon: 'printer', onClick: () => window.print() },
            { label: 'En faire une envie', icon: 'scroll', onClick: toWish },
            { label: 'En faire un projet', icon: 'kanban', onClick: toProject },
            { label: 'Mettre à la corbeille', icon: 'trash', danger: true, onClick: remove },
          ]}
        />
      </div>

      {draft.cover && (
        <CoverView cover={draft.cover} className="note-cover">
          <button className="btn sm note-cover-btn no-print" onClick={() => setCoverOpen(true)}>
            Changer
          </button>
        </CoverView>
      )}

      <div className={`note-layout ${draft.cover ? 'has-cover' : ''}`}>
        <article className="note-body print-area">
          <div className="note-icon-row no-print">
            <button className="note-icon" onClick={() => setIconOpen(true)} aria-label="Choisir une icône">
              {draft.icon || <Icon name="sparkle" size={20} style={{ color: 'var(--ink-faint)' }} />}
            </button>
            {!draft.cover && (
              <button className="btn ghost sm" onClick={() => setCoverOpen(true)}>
                <Icon name="image" size={15} /> Couverture
              </button>
            )}
          </div>
          {draft.icon && <div className="print-only note-print-icon">{draft.icon}</div>}
          <input className="title-input" placeholder="Sans titre" value={draft.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!initial.title} />

          <div className="note-meta no-print">
            <div className="note-meta-row">
              <Icon name="folder" size={15} />
              <select className="note-select" value={draft.folderId ?? ''} onChange={(e) => set({ folderId: e.target.value || null, inbox: false })}>
                <option value="">Aucun dossier</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {draft.inbox && (
                <button className="chip" onClick={() => set({ inbox: false })} title="Sortir de la boîte d’entrée">
                  <Icon name="inbox" size={12} /> Dans la boîte d’entrée · classer
                </button>
              )}
            </div>
            <div className="note-meta-row">
              <Icon name="tag" size={15} />
              <TagInput value={draft.tags} onChange={(tags) => set({ tags })} suggestions={allTags} />
            </div>
          </div>
          <div className="print-only faint note-print-meta">
            {fmtDay(new Date(initial.createdAt))}
            {draft.tags.length > 0 && ' · ' + draft.tags.map((t) => '#' + t).join(' ')}
          </div>

          <RichEditor
            content={draft.content}
            placeholder="Raconte, colle un lien, glisse une image…"
            onChange={(content, text) => set({ content, text })}
            onLinkContent={(e) => link('note', initial.id, e.type, e.id)}
          />
        </article>

        <aside className="note-side no-print">
          <LinkedItems type="note" id={initial.id} />
          <div className="note-dates faint">
            Créée le {fmtDay(new Date(initial.createdAt))}
            <br />
            Sauvegarde automatique
          </div>
        </aside>
      </div>

      <Modal open={coverOpen} onClose={() => setCoverOpen(false)} title="Couverture">
        <CoverPicker
          value={draft.cover}
          onChange={(c) => {
            set({ cover: c })
            setCoverOpen(false)
          }}
        />
      </Modal>
      <Modal open={iconOpen} onClose={() => setIconOpen(false)} title="Icône" width={380}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
          {ICONS.map((i) => (
            <button
              key={i}
              className="btn ghost icon"
              style={{ fontSize: 20 }}
              onClick={() => {
                set({ icon: i })
                setIconOpen(false)
              }}
            >
              {i}
            </button>
          ))}
        </div>
        {draft.icon && (
          <button
            className="btn ghost sm"
            style={{ marginTop: 12 }}
            onClick={() => {
              set({ icon: undefined })
              setIconOpen(false)
            }}
          >
            Retirer l’icône
          </button>
        )}
      </Modal>
    </div>
  )
}
