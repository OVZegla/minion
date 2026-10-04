import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db, uid } from '../../db/db'
import { updateSettings, useSettings } from '../../db/settings'
import type { Project } from '../../db/types'
import { CoverView, COVER_PRESETS } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { Modal, useUI } from '../../components/ui'
import { fmtShortDay, parseYmd } from '../../lib/dates'
import './projects.css'

export function ProjectsPage() {
  const navigate = useNavigate()
  const settings = useSettings()
  const [view, setView] = useState<'list' | 'board'>(() => (localStorage.getItem('minion:projView') as 'list' | 'board') ?? 'board')
  const [colsOpen, setColsOpen] = useState(false)
  const projects = useLiveQuery(() => db.projects.orderBy('order').filter((p) => !p.trashedAt).toArray(), []) ?? []
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []
  const cols = settings.projectColumns

  const setV = (v: 'list' | 'board') => {
    setView(v)
    try {
      localStorage.setItem('minion:projView', v)
    } catch {
      /* rien */
    }
  }

  const create = async (status = cols[0]?.id ?? 'idee') => {
    const p: Project = { ...base(), title: '', intention: '', status, order: projects.length, cover: COVER_PRESETS[projects.length % 6] }
    await db.projects.add(p)
    navigate(`/projets/${p.id}`)
  }

  const progress = (p: Project) => {
    const t = tasks.filter((x) => x.projectId === p.id && !x.trashedAt)
    return t.length ? { done: t.filter((x) => x.done).length, total: t.length } : null
  }

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1>Projets</h1>
          <p className="sub">Imaginer une pièce, apprendre un morceau, explorer une idée…</p>
        </div>
        <span className="spacer" />
        <div className="seg">
          <button className={view === 'board' ? 'on' : ''} onClick={() => setV('board')}>
            Tableau
          </button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setV('list')}>
            Liste
          </button>
        </div>
        {view === 'board' && (
          <button className="btn ghost sm" onClick={() => setColsOpen(true)}>
            Colonnes
          </button>
        )}
        <button className="btn primary" onClick={() => create()}>
          <Icon name="plus" size={16} /> Nouveau projet
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty">
          <span className="hand">Et si…</span>
          Un projet peut naître d’une envie de ton parchemin ou d’une simple note.
        </div>
      ) : view === 'list' ? (
        <div className="proj-list">
          {projects.map((p) => (
            <ProjectRow key={p.id} p={p} col={cols.find((c) => c.id === p.status)?.name} prog={progress(p)} />
          ))}
        </div>
      ) : (
        <Board projects={projects} cols={cols} progress={progress} onCreate={create} />
      )}

      <ColumnsModal open={colsOpen} onClose={() => setColsOpen(false)} cols={cols} projects={projects} />
    </div>
  )
}

function ProjectRow({ p, col, prog }: { p: Project; col?: string; prog: { done: number; total: number } | null }) {
  const navigate = useNavigate()
  return (
    <button className="card proj-row hoverable" onClick={() => navigate(`/projets/${p.id}`)}>
      <CoverView cover={p.cover} className="proj-row-cover" />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div className="proj-title">{p.title || 'Projet sans nom'}</div>
        {p.intention && <div className="faint proj-intent">{p.intention}</div>}
      </div>
      {prog && <Progress {...prog} />}
      {p.endDate && <span className="faint" style={{ fontSize: '0.8rem' }}>{fmtShortDay(parseYmd(p.endDate))}</span>}
      <span className="chip neutral">{col}</span>
    </button>
  )
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <span className="proj-progress" title={`${done} sur ${total} étapes`}>
      <span className="proj-progress-bar">
        <span style={{ width: `${(done / total) * 100}%` }} />
      </span>
      <span className="faint">
        {done}/{total}
      </span>
    </span>
  )
}

function Board({
  projects,
  cols,
  progress,
  onCreate,
}: {
  projects: Project[]
  cols: { id: string; name: string }[]
  progress: (p: Project) => { done: number; total: number } | null
  onCreate: (status: string) => void
}) {
  const navigate = useNavigate()
  const [over, setOver] = useState<string | null>(null)
  const drop = async (status: string, id: string) => {
    setOver(null)
    await db.projects.update(id, { status, updatedAt: Date.now() })
  }
  // projets dont la colonne a été supprimée : affichés dans la première
  const colOf = (p: Project) => (cols.some((c) => c.id === p.status) ? p.status : cols[0]?.id)
  return (
    <div className="board">
      {cols.map((c) => {
        const items = projects.filter((p) => colOf(p) === c.id)
        return (
          <div
            key={c.id}
            className={`board-col ${over === c.id ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(c.id)
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(c.id, e.dataTransfer.getData('text/project'))}
          >
            <div className="board-col-head">
              <span>{c.name}</span>
              <span className="faint">{items.length}</span>
            </div>
            {items.map((p) => {
              const prog = progress(p)
              return (
                <div key={p.id} className="card board-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/project', p.id)} onClick={() => navigate(`/projets/${p.id}`)}>
                  {p.cover && <CoverView cover={p.cover} className="board-card-cover" />}
                  <div className="board-card-body">
                    <div className="proj-title">{p.title || 'Projet sans nom'}</div>
                    {p.intention && <p className="faint proj-intent">{p.intention}</p>}
                    {(prog || p.endDate) && (
                      <div className="row" style={{ marginTop: 10, fontSize: '0.78rem' }}>
                        {prog && <Progress {...prog} />}
                        <span className="spacer" />
                        {p.endDate && <span className="faint">{fmtShortDay(parseYmd(p.endDate))}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <button className="board-add" onClick={() => onCreate(c.id)}>
              <Icon name="plus" size={15} /> Ajouter
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ColumnsModal({ open, onClose, cols, projects }: { open: boolean; onClose: () => void; cols: { id: string; name: string }[]; projects: Project[] }) {
  const { confirm } = useUI()
  const [draft, setDraft] = useState(cols)
  const [name, setName] = useState('')
  useEffect(() => {
    if (open) setDraft(cols)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const sync = (next: typeof cols) => {
    setDraft(next)
    updateSettings({ projectColumns: next })
  }
  return (
    <Modal open={open} onClose={onClose} title="Colonnes du tableau" width={420} footer={<button className="btn primary" onClick={onClose}>Terminé</button>}>
      <p className="muted" style={{ marginBottom: 12, fontSize: '0.9rem' }}>
        Choisis les états qui te parlent.
      </p>
      {draft.map((c, i) => (
        <div key={c.id} className="row" style={{ marginBottom: 6 }}>
          <input className="input" value={c.name} onChange={(e) => sync(draft.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} />
          <button className="btn ghost icon sm" disabled={i === 0} aria-label="Monter" onClick={() => { const n = [...draft]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; sync(n) }}>
            <Icon name="chevronDown" size={15} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button
            className="btn ghost icon sm"
            aria-label="Supprimer la colonne"
            disabled={draft.length <= 1}
            onClick={async () => {
              const count = projects.filter((p) => p.status === c.id).length
              if (count && !(await confirm({ title: 'Supprimer cette colonne ?', message: `${count} projet(s) iront dans « ${draft.find((x) => x.id !== c.id)!.name} ».`, confirmLabel: 'Supprimer' }))) return
              const rest = draft.filter((x) => x.id !== c.id)
              await db.projects.where('status').equals(c.id).modify({ status: rest[0].id })
              sync(rest)
            }}
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 12 }}>
        <input className="input" placeholder="Nouvelle colonne" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { sync([...draft, { id: uid(), name: name.trim() }]); setName('') } }} />
        <button className="btn" disabled={!name.trim()} onClick={() => { sync([...draft, { id: uid(), name: name.trim() }]); setName('') }}>
          Ajouter
        </button>
      </div>
    </Modal>
  )
}
