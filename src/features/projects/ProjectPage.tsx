import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db, uid } from '../../db/db'
import { link, removeAllLinks } from '../../db/links'
import { pickFiles, saveAsset, useAssetUrl } from '../../db/assets'
import { useSettings } from '../../db/settings'
import type { Moodboard, Project } from '../../db/types'
import { CoverPicker, CoverView } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { LinkedItems } from '../../components/Linked'
import { TaskList } from '../../components/TaskList'
import { Menu, Modal, SaveStatus, useAutosave, useUI } from '../../components/ui'
import { createNote } from '../notes/api'
import './projects.css'

export function ProjectPage() {
  const { id } = useParams()
  const p = useLiveQuery(() => db.projects.get(id!), [id])
  if (p === undefined) return null
  if (!p)
    return (
      <div className="page narrow empty">
        <span className="hand">Introuvable</span>Ce projet n’existe plus.
      </div>
    )
  return <ProjectEditor key={p.id} initial={p} />
}

function ProjectEditor({ initial }: { initial: Project }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const { confirm, toast } = useUI()
  const [d, setD] = useState<Project>(initial)
  const [coverOpen, setCoverOpen] = useState(false)
  const [res, setRes] = useState({ label: '', url: '' })
  const set = (p: Partial<Project>) => setD((x) => ({ ...x, ...p }))
  // on n'écrase pas `openedAt` ni ce qui change ailleurs : seuls les champs édités ici
  const state = useAutosave(d, (v) =>
    db.projects.update(initial.id, {
      title: v.title,
      intention: v.intention,
      cover: v.cover,
      status: v.status,
      startDate: v.startDate,
      endDate: v.endDate,
      resources: v.resources,
      documents: v.documents,
      results: v.results,
      updatedAt: Date.now(),
    }),
  )

  useEffect(() => {
    db.projects.update(initial.id, { openedAt: Date.now() })
  }, [initial.id])

  const newNote = async () => {
    const n = await createNote({ title: '' })
    await link('project', initial.id, 'note', n.id)
    navigate(`/notes/${n.id}`)
  }
  const newBoard = async () => {
    const m: Moodboard = { ...base(), title: d.title ? `Inspiration · ${d.title}` : 'Moodboard', background: '#fbf7f0', items: [] }
    await db.moodboards.add(m)
    await link('project', initial.id, 'moodboard', m.id)
    navigate(`/moodboards/${m.id}`)
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Supprimer ce projet ?', message: 'Ses tâches seront supprimées. Les notes, moodboards et envies reliés restent intacts à leur place.', confirmLabel: 'Supprimer définitivement', danger: true }))) return
    await db.tasks.where('projectId').equals(initial.id).delete()
    await removeAllLinks('project', initial.id)
    await db.projects.delete(initial.id)
    navigate('/projets')
    toast('Projet supprimé')
  }

  const addResource = () => {
    if (!res.url.trim()) return
    const url = /^[a-z]+:/i.test(res.url) ? res.url.trim() : `https://${res.url.trim()}`
    set({ resources: [...(d.resources ?? []), { id: uid(), label: res.label.trim() || url, url }] })
    setRes({ label: '', url: '' })
  }

  return (
    <div className="proj-page">
      <CoverView cover={d.cover} className="proj-cover">
        <div className="proj-cover-bar no-print">
          <button className="btn sm" onClick={() => navigate('/projets')}>
            <Icon name="chevronLeft" size={15} /> Projets
          </button>
          <span className="spacer" />
          <SaveStatus state={state} />
          <button className="btn sm" onClick={() => setCoverOpen(true)}>
            Couverture
          </button>
          <Menu
            trigger={
              <button className="btn sm icon" aria-label="Plus d’options">
                <Icon name="more" size={16} />
              </button>
            }
            items={[{ label: 'Supprimer le projet', icon: 'trash', danger: true, onClick: remove }]}
          />
        </div>
      </CoverView>

      <div className="proj-body">
        <div className="proj-main">
          <input className="title-input" placeholder="Nom du projet" value={d.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!initial.title} />
          <textarea className="proj-intention" placeholder="Mon intention : pourquoi ce projet me tient à cœur…" value={d.intention} onChange={(e) => set({ intention: e.target.value })} rows={2} />

          <div className="proj-meta">
            <label>
              <span className="label">État</span>
              <select className="select" value={d.status} onChange={(e) => set({ status: e.target.value })}>
                {settings.projectColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Début (facultatif)</span>
              <input type="date" className="input" value={d.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} />
            </label>
            <label>
              <span className="label">Fin (facultative)</span>
              <input type="date" className="input" value={d.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} />
            </label>
          </div>

          <section className="proj-section">
            <h3>Étapes et tâches</h3>
            <TaskList projectId={initial.id} placeholder="Ajouter une étape…" />
          </section>

          <section className="proj-section">
            <div className="row">
              <h3>Créations et résultats</h3>
              <span className="spacer" />
              <button
                className="btn ghost sm"
                onClick={async () => {
                  const files = await pickFiles('image/*', true)
                  const ids = await Promise.all(files.map(saveAsset))
                  set({ results: [...(d.results ?? []), ...ids] })
                }}
              >
                <Icon name="plus" size={14} /> Ajouter des images
              </button>
            </div>
            {(d.results ?? []).length === 0 ? (
              <p className="faint" style={{ fontSize: '0.88rem' }}>
                Photos, visuels, captures de ce que tu as créé.
              </p>
            ) : (
              <div className="proj-gallery">
                {d.results!.map((r) => (
                  <GalleryImage key={r} id={r} onRemove={() => set({ results: d.results!.filter((x) => x !== r) })} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="proj-side">
          <div className="card pad">
            <LinkedItems type="project" id={initial.id} title="Notes, moodboards, envies" />
            <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
              <button className="btn sm" onClick={newNote}>
                <Icon name="book" size={14} /> Nouvelle note
              </button>
              <button className="btn sm" onClick={newBoard}>
                <Icon name="image" size={14} /> Nouveau moodboard
              </button>
            </div>
          </div>

          <div className="card pad">
            <span className="eyebrow">Liens</span>
            <div className="stack" style={{ gap: 4, margin: '8px 0' }}>
              {(d.resources ?? []).map((r) => (
                <div key={r.id} className="linked-item">
                  <a className="linked-open" href={r.url} target="_blank" rel="noopener noreferrer">
                    <Icon name="link" size={14} />
                    <span className="linked-title">{r.label}</span>
                  </a>
                  <button className="btn ghost icon sm" aria-label="Retirer" onClick={() => set({ resources: d.resources!.filter((x) => x.id !== r.id) })}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <input className="input" style={{ marginBottom: 6 }} placeholder="https://…" value={res.url} onChange={(e) => setRes({ ...res, url: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addResource()} />
            <div className="row">
              <input className="input" placeholder="Nom (facultatif)" value={res.label} onChange={(e) => setRes({ ...res, label: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addResource()} />
              <button className="btn sm" onClick={addResource} disabled={!res.url.trim()}>
                Ajouter
              </button>
            </div>
          </div>

          <div className="card pad">
            <div className="row">
              <span className="eyebrow">Documents</span>
              <span className="spacer" />
              <button
                className="btn ghost sm"
                onClick={async () => {
                  const files = await pickFiles('*/*', true)
                  const ids = await Promise.all(files.map(saveAsset))
                  set({ documents: [...(d.documents ?? []), ...ids] })
                }}
              >
                <Icon name="plus" size={14} /> Joindre
              </button>
            </div>
            {(d.documents ?? []).length === 0 && (
              <p className="faint" style={{ fontSize: '0.85rem', marginTop: 6 }}>
                PDF, images, fichiers utiles.
              </p>
            )}
            {(d.documents ?? []).map((doc) => (
              <DocRow key={doc} id={doc} onRemove={() => set({ documents: d.documents!.filter((x) => x !== doc) })} />
            ))}
          </div>
        </aside>
      </div>

      <Modal open={coverOpen} onClose={() => setCoverOpen(false)} title="Couverture">
        <CoverPicker
          value={d.cover}
          onChange={(c) => {
            set({ cover: c })
            setCoverOpen(false)
          }}
        />
      </Modal>
    </div>
  )
}

function GalleryImage({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = useAssetUrl(id)
  return (
    <div className="proj-gallery-item">
      {url && <img src={url} alt="" />}
      <button className="wish-photo-x" onClick={onRemove} aria-label="Retirer l’image">
        <Icon name="x" size={12} />
      </button>
    </div>
  )
}

function DocRow({ id, onRemove }: { id: string; onRemove: () => void }) {
  const asset = useLiveQuery(() => db.assets.get(id), [id])
  const url = useAssetUrl(id)
  if (!asset) return null
  return (
    <div className="linked-item">
      <a className="linked-open" href={url ?? undefined} download={asset.name} target="_blank" rel="noopener">
        <Icon name="download" size={14} />
        <span className="linked-title">{asset.name}</span>
      </a>
      <button className="btn ghost icon sm" aria-label="Retirer le document" onClick={onRemove}>
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
