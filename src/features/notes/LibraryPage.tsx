import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Menu, Modal, useUI } from '../../components/ui'
import { normalize } from '../../components/SearchPalette'
import { createNote, deleteNoteForever, restoreNote } from './api'
import { NoteCard } from './NoteCard'
import { relative } from '../../lib/dates'
import './notes.css'

type View = { kind: 'all' } | { kind: 'fav' } | { kind: 'folder'; id: string } | { kind: 'tag'; tag: string } | { kind: 'trash' }

const FOLDER_COLORS = ['#c98b8b', '#8fa58a', '#a397c4', '#c8805f', '#7f9db5', '#c9a46a']

export function LibraryPage() {
  const navigate = useNavigate()
  const { confirm, toast } = useUI()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [folderModal, setFolderModal] = useState<{ id?: string; name: string; color: string } | null>(null)

  const view: View = params.get('dossier')
    ? { kind: 'folder', id: params.get('dossier')! }
    : params.get('tag')
      ? { kind: 'tag', tag: params.get('tag')! }
      : params.get('vue') === 'favoris'
        ? { kind: 'fav' }
        : params.get('vue') === 'corbeille'
          ? { kind: 'trash' }
          : { kind: 'all' }

  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? []
  const folders = useLiveQuery(() => db.folders.toArray(), []) ?? []

  const live = notes.filter((n) => !n.trashedAt)
  const tags = useMemo(() => {
    const m = new Map<string, number>()
    live.forEach((n) => n.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [live])

  const shown = useMemo(() => {
    let list = view.kind === 'trash' ? notes.filter((n) => n.trashedAt) : live
    if (view.kind === 'fav') list = list.filter((n) => n.favorite)
    if (view.kind === 'folder') list = list.filter((n) => n.folderId === view.id)
    if (view.kind === 'tag') list = list.filter((n) => n.tags.includes(view.tag))
    if (view.kind === 'all') list = list.filter((n) => !n.inbox)
    const nq = normalize(q.trim())
    if (nq) list = list.filter((n) => normalize(`${n.title} ${n.text} ${n.tags.join(' ')}`).includes(nq))
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [notes, live, view.kind, (view as { id?: string }).id, (view as { tag?: string }).tag, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (p: Record<string, string>) => setParams(p)
  const currentFolder = view.kind === 'folder' ? folders.find((f) => f.id === view.id) : undefined

  const title =
    view.kind === 'fav' ? 'Favoris' : view.kind === 'trash' ? 'Corbeille' : view.kind === 'tag' ? `#${view.tag}` : currentFolder ? currentFolder.name : 'Bibliothèque'

  const newNote = async () => {
    const n = await createNote({ folderId: currentFolder?.id ?? null, tags: view.kind === 'tag' ? [view.tag] : [], favorite: view.kind === 'fav' })
    navigate(`/notes/${n.id}`)
  }

  const saveFolder = async () => {
    if (!folderModal?.name.trim()) return
    if (folderModal.id) await db.folders.update(folderModal.id, { name: folderModal.name.trim(), color: folderModal.color, updatedAt: Date.now() })
    else await db.folders.add({ ...base(), name: folderModal.name.trim(), color: folderModal.color, parentId: null })
    setFolderModal(null)
  }

  const deleteFolder = async (id: string) => {
    const ok = await confirm({ title: 'Supprimer ce dossier ?', message: 'Les notes qu’il contient ne sont pas supprimées : elles restent dans ta bibliothèque, sans dossier.', confirmLabel: 'Supprimer le dossier', danger: true })
    if (!ok) return
    await db.notes.where('folderId').equals(id).modify({ folderId: null })
    await db.folders.delete(id)
    go({})
  }

  return (
    <div className="page wide library">
      <aside className="lib-side">
        <button className={`lib-link ${view.kind === 'all' ? 'on' : ''}`} onClick={() => go({})}>
          <Icon name="book" size={16} /> Toutes mes notes <span className="faint">{live.filter((n) => !n.inbox).length}</span>
        </button>
        <button className="lib-link" onClick={() => navigate('/boite')}>
          <Icon name="inbox" size={16} /> Boîte d’entrée <span className="faint">{live.filter((n) => n.inbox).length}</span>
        </button>
        <button className={`lib-link ${view.kind === 'fav' ? 'on' : ''}`} onClick={() => go({ vue: 'favoris' })}>
          <Icon name="star" size={16} /> Favoris
        </button>

        <div className="lib-section">
          <span className="eyebrow">Dossiers</span>
          <button className="btn ghost icon sm" aria-label="Nouveau dossier" onClick={() => setFolderModal({ name: '', color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length] })}>
            <Icon name="plus" size={15} />
          </button>
        </div>
        {folders.length === 0 && <p className="faint lib-hint">Crée des dossiers pour ranger tes notes comme tu l’entends.</p>}
        {folders
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((f) => (
            <div key={f.id} className={`lib-link ${view.kind === 'folder' && view.id === f.id ? 'on' : ''}`} onClick={() => go({ dossier: f.id })}>
              <Icon name="folder" size={16} style={{ color: f.color }} />
              <span className="lib-link-name">{f.name}</span>
              <span className="faint">{live.filter((n) => n.folderId === f.id).length}</span>
              <Menu
                trigger={
                  <button className="btn ghost icon sm lib-more" aria-label="Options du dossier">
                    <Icon name="more" size={15} />
                  </button>
                }
                items={[
                  { label: 'Renommer', icon: 'pen', onClick: () => setFolderModal({ id: f.id, name: f.name, color: f.color ?? FOLDER_COLORS[0] }) },
                  { label: 'Supprimer le dossier', icon: 'trash', danger: true, onClick: () => deleteFolder(f.id) },
                ]}
              />
            </div>
          ))}

        <div className="lib-section">
          <span className="eyebrow">Tags</span>
        </div>
        {tags.length === 0 && <p className="faint lib-hint">Ajoute des tags dans une note pour créer des collections.</p>}
        <div className="row wrap" style={{ gap: 6, padding: '0 6px' }}>
          {tags.map(([t, c]) => (
            <button key={t} className={`chip ${view.kind === 'tag' && view.tag === t ? 'active' : 'neutral'}`} onClick={() => go({ tag: t })}>
              #{t} <span style={{ opacity: 0.6 }}>{c}</span>
            </button>
          ))}
        </div>

        <button className={`lib-link ${view.kind === 'trash' ? 'on' : ''}`} style={{ marginTop: 24 }} onClick={() => go({ vue: 'corbeille' })}>
          <Icon name="trash" size={16} /> Corbeille
        </button>
      </aside>

      <section className="lib-main">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <p className="sub">
              {view.kind === 'trash' ? 'Les notes supprimées restent ici jusqu’à ce que tu les effaces définitivement.' : `${shown.length} note${shown.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <span className="spacer" />
          <div className="lib-search">
            <Icon name="search" size={16} />
            <input placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {view.kind !== 'trash' && (
            <button className="btn primary" onClick={newNote}>
              <Icon name="plus" size={16} /> Nouvelle note
            </button>
          )}
        </div>

        {view.kind === 'trash' ? (
          shown.length === 0 ? (
            <div className="empty">
              <span className="hand">Rien ici</span>La corbeille est vide.
            </div>
          ) : (
            <div className="stack">
              {shown.map((n) => (
                <div key={n.id} className="card pad row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{n.title || 'Sans titre'}</div>
                    <div className="faint" style={{ fontSize: '0.8rem' }}>
                      Supprimée {relative(n.trashedAt!)}
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => restoreNote(n.id).then(() => toast('Note restaurée'))}>
                    Restaurer
                  </button>
                  <button
                    className="btn sm danger"
                    onClick={async () => {
                      if (await confirm({ title: 'Supprimer définitivement ?', message: `« ${n.title || 'Sans titre'} » sera effacée pour toujours. Cette action est irréversible.`, confirmLabel: 'Supprimer définitivement', danger: true }))
                        await deleteNoteForever(n.id)
                    }}
                  >
                    Supprimer définitivement
                  </button>
                </div>
              ))}
            </div>
          )
        ) : shown.length === 0 ? (
          <div className="empty">
            <span className="hand">{q ? 'Rien trouvé' : 'Une page blanche'}</span>
            {q ? 'Essaie un autre mot.' : 'Ta première note t’attend.'}
          </div>
        ) : (
          <div className="note-grid">
            {shown.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={!!folderModal}
        onClose={() => setFolderModal(null)}
        title={folderModal?.id ? 'Renommer le dossier' : 'Nouveau dossier'}
        width={400}
        footer={
          <>
            <button className="btn ghost" onClick={() => setFolderModal(null)}>
              Annuler
            </button>
            <button className="btn primary" onClick={saveFolder} disabled={!folderModal?.name.trim()}>
              Enregistrer
            </button>
          </>
        }
      >
        <div className="field">
          <label className="label">Nom</label>
          <input
            className="input"
            autoFocus
            placeholder="Musique, Déco, Business…"
            value={folderModal?.name ?? ''}
            onChange={(e) => setFolderModal((f) => f && { ...f, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveFolder()}
          />
        </div>
        <label className="label">Couleur</label>
        <div className="row">
          {FOLDER_COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Couleur ${c}`}
              onClick={() => setFolderModal((f) => f && { ...f, color: c })}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: folderModal?.color === c ? '3px solid var(--ink)' : '3px solid transparent', cursor: 'pointer' }}
            />
          ))}
        </div>
      </Modal>
    </div>
  )
}
