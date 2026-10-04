import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Note } from '../../db/types'
import { Icon } from '../../components/Icon'
import { useUI } from '../../components/ui'
import { relative } from '../../lib/dates'
import { suggestClassification } from './classify'
import { trashNote } from './api'
import { QuickCapture } from '../../components/QuickCapture'
import './notes.css'

/** Boîte d'entrée : les idées capturées, à classer quand elle en a envie. */
export function InboxPage() {
  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? []
  const folders = useLiveQuery(() => db.folders.toArray(), []) ?? []
  const [capture, setCapture] = useState(false)
  const inbox = notes.filter((n) => n.inbox && !n.trashedAt).sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Boîte d’entrée</h1>
          <p className="sub">Les idées notées au vol. Rien ne presse pour les ranger.</p>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setCapture(true)}>
          <Icon name="plus" size={16} /> Noter une idée
        </button>
      </div>
      {inbox.length === 0 ? (
        <div className="empty">
          <span className="hand">Tout est rangé</span>
          Les idées que tu captures arriveront ici.
        </div>
      ) : (
        <div className="stack">
          {inbox.map((n) => (
            <InboxItem key={n.id} note={n} all={notes} folders={folders} />
          ))}
        </div>
      )}
      <QuickCapture open={capture} onClose={() => setCapture(false)} />
    </div>
  )
}

function InboxItem({ note, all, folders }: { note: Note; all: Note[]; folders: { id: string; name: string; color?: string }[] }) {
  const navigate = useNavigate()
  const { toast } = useUI()
  const sugg = useMemo(() => suggestClassification(note, all, folders as never), [note, all, folders])
  const [folderId, setFolderId] = useState<string>(sugg.folderIds[0] ?? '')
  const [tags, setTags] = useState<string[]>([])

  const file = async () => {
    await db.notes.update(note.id, { inbox: false, folderId: folderId || null, tags: [...new Set([...note.tags, ...tags])], updatedAt: Date.now() })
    toast('Note classée dans ta bibliothèque')
  }

  return (
    <div className="card pad inbox-item">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(`/notes/${note.id}`)}>
          <div className="inbox-title">{note.title || 'Sans titre'}</div>
          {note.text && <p className="muted inbox-text">{note.text.slice(0, 220)}</p>}
          <div className="faint" style={{ fontSize: '0.76rem', marginTop: 6 }}>
            Notée {relative(note.createdAt)}
          </div>
        </div>
        <button className="btn ghost icon sm" aria-label="Mettre à la corbeille" onClick={() => trashNote(note.id).then(() => toast('Mise à la corbeille'))}>
          <Icon name="trash" size={15} />
        </button>
      </div>

      <div className="inbox-file">
        <select className="note-select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          <option value="">Sans dossier</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {sugg.folderIds.includes(f.id) ? ' · suggéré' : ''}
            </option>
          ))}
        </select>
        {sugg.tags.map((t) => (
          <button key={t} className={`chip ${tags.includes(t) ? 'active' : 'neutral'}`} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} title="Tag suggéré, clique pour l’ajouter">
            #{t}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn sm" onClick={() => navigate(`/notes/${note.id}`)}>
          Ouvrir
        </button>
        <button className="btn sm primary" onClick={file}>
          Classer
        </button>
      </div>
      {(sugg.folderIds.length > 0 || sugg.tags.length > 0) && (
        <p className="faint" style={{ fontSize: '0.74rem', marginTop: 8 }}>
          Suggestions basées sur les mots communs avec tes notes déjà classées. Tu choisis.
        </p>
      )}
    </div>
  )
}
