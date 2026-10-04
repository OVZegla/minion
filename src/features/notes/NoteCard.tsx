import { useNavigate } from 'react-router-dom'
import type { Note } from '../../db/types'
import { CoverView } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { relative } from '../../lib/dates'

export function NoteCard({ note }: { note: Note }) {
  const navigate = useNavigate()
  return (
    <article className="card hoverable note-card" onClick={() => navigate(`/notes/${note.id}`)}>
      {note.cover && <CoverView cover={note.cover} className="note-card-cover" />}
      <div className="note-card-body">
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          {note.icon && <span className="note-card-icon">{note.icon}</span>}
          <h3 className="note-card-title">{note.title || 'Sans titre'}</h3>
          {note.favorite && <Icon name="star" size={15} fill="var(--gold)" style={{ color: 'var(--gold)', marginLeft: 'auto', marginTop: 3 }} />}
        </div>
        {note.text && <p className="note-card-text">{note.text.slice(0, 160)}</p>}
        <div className="row wrap note-card-foot">
          {note.tags.slice(0, 3).map((t) => (
            <span key={t} className="chip neutral">
              #{t}
            </span>
          ))}
          <span className="spacer" />
          <span className="faint" style={{ fontSize: '0.76rem' }}>
            {relative(note.updatedAt)}
          </span>
        </div>
      </div>
    </article>
  )
}
