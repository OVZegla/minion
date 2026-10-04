import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../db/db'
import type { Task } from '../db/types'
import { fmtShortDay, parseYmd, ymd } from '../lib/dates'
import { Icon } from './Icon'
import './tasks.css'

/** Liste de tâches, avec ou sans date. Filtrable par projet. */
export function TaskList({ projectId, filter, showDone = true, placeholder = 'Ajouter une tâche…', defaultDate = null }: {
  projectId?: string | null
  filter?: (t: Task) => boolean
  showDone?: boolean
  placeholder?: string
  defaultDate?: string | null
}) {
  const tasks =
    useLiveQuery(
      () => (projectId ? db.tasks.where('projectId').equals(projectId).toArray() : db.tasks.toArray()),
      [projectId],
    ) ?? []
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<string>(defaultDate ?? '')
  const [doneOpen, setDoneOpen] = useState(false)

  const list = tasks.filter((t) => !t.trashedAt && (!filter || filter(t))).sort((a, b) => a.order - b.order)
  const open = list.filter((t) => !t.done)
  const done = list.filter((t) => t.done)

  const add = async () => {
    if (!title.trim()) return
    await db.tasks.add({ ...base(), title: title.trim(), done: false, date: date || null, projectId: projectId ?? null, order: Date.now() })
    setTitle('')
    setDate(defaultDate ?? '')
  }

  return (
    <div className="tasks">
      {open.map((t) => (
        <TaskRow key={t.id} t={t} />
      ))}
      <div className="task-add">
        <Icon name="plus" size={15} />
        <input value={title} placeholder={placeholder} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <input type="date" className="task-date-input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date (facultative)" title="Date (facultative)" />
        {title.trim() && (
          <button className="btn sm primary" onClick={add}>
            Ajouter
          </button>
        )}
      </div>
      {showDone && done.length > 0 && (
        <>
          <button className="task-done-toggle" onClick={() => setDoneOpen((o) => !o)}>
            <Icon name="chevronDown" size={14} style={{ transform: doneOpen ? undefined : 'rotate(-90deg)' }} /> Fait · {done.length}
          </button>
          {doneOpen && done.map((t) => <TaskRow key={t.id} t={t} />)}
        </>
      )}
    </div>
  )
}

export function TaskRow({ t }: { t: Task }) {
  const [editing, setEditing] = useState(false)
  const today = ymd()
  return (
    <div className={`task ${t.done ? 'done' : ''}`}>
      <button
        className={`task-check ${t.done ? 'on' : ''}`}
        aria-label={t.done ? 'Marquer comme non fait' : 'Marquer comme fait'}
        onClick={() => db.tasks.update(t.id, { done: !t.done, updatedAt: Date.now() })}
      >
        {t.done && <Icon name="check" size={12} strokeWidth={2.6} />}
      </button>
      {editing ? (
        <input
          className="task-edit"
          autoFocus
          defaultValue={t.title}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v) db.tasks.update(t.id, { title: v, updatedAt: Date.now() })
            setEditing(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <span className="task-title" onDoubleClick={() => setEditing(true)}>
          {t.title}
        </span>
      )}
      {t.date && <span className={`task-date ${!t.done && t.date < today ? 'past' : ''}`}>{fmtShortDay(parseYmd(t.date))}</span>}
      <div className="task-actions">
        {t.date && !t.done && t.date < today && (
          <button className="btn ghost sm" title="Reporter à aujourd’hui" onClick={() => db.tasks.update(t.id, { date: today, updatedAt: Date.now() })}>
            Aujourd’hui
          </button>
        )}
        {t.date && (
          <button className="btn ghost sm" title="Retirer la date" onClick={() => db.tasks.update(t.id, { date: null, updatedAt: Date.now() })}>
            Sans date
          </button>
        )}
        <button className="btn ghost icon sm" aria-label="Modifier" onClick={() => setEditing(true)}>
          <Icon name="pen" size={14} />
        </button>
        <button className="btn ghost icon sm" aria-label="Supprimer la tâche" onClick={() => db.tasks.delete(t.id)}>
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  )
}
