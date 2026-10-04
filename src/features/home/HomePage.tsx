import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { updateSettings, useSettings } from '../../db/settings'
import type { HomeBlock } from '../../db/types'
import { useAssetUrl } from '../../db/assets'
import { addDays, capitalize, fmtLongDate, fmtTime, relative, ymd } from '../../lib/dates'
import { greeting } from '../../lib/phrases'
import { Icon } from '../../components/Icon'
import { CoverView } from '../../components/Cover'
import { useUI } from '../../components/ui'
import { captureTo } from '../../components/QuickCapture'
import { occurrences } from '../calendar/api'
import { WISH_STATES } from '../wishes/meta'
import { MoodboardThumb } from '../moodboards/MoodboardThumb'
import { MiniRoll } from '../synth/SongsPage'
import { Mascot } from '../../components/Mascot'
import { useInstall } from '../../lib/install'
import './home.css'

const BLOCK_LABEL: Record<HomeBlock['id'], string> = {
  today: 'Aujourd’hui',
  capture: 'Capture rapide',
  recent: 'Récemment ouverts',
  wish: 'Une envie du parchemin',
  journal: 'Journal',
  moodboard: 'Moodboard à la une',
  treasure: 'Un petit bonheur',
  projects: 'Projets en cours',
  song: 'Reprendre un morceau',
}

export function HomePage() {
  const settings = useSettings()
  const [editing, setEditing] = useState(false)
  const today = new Date()

  const blocks = settings.homeBlocks
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    updateSettings({ homeBlocks: next })
  }
  const toggle = (i: number) => {
    const next = blocks.map((b, k) => (k === i ? { ...b, visible: !b.visible } : b))
    updateSettings({ homeBlocks: next })
  }

  return (
    <div className="page home">
      <header className="home-head">
        <div>
          <div className="eyebrow">{capitalize(fmtLongDate(today))}</div>
          <h1>
            {greeting()} <span className="home-name">{settings.name}</span>
          </h1>
        </div>
        <button className="btn ghost sm" onClick={() => setEditing((e) => !e)}>
          <Icon name={editing ? 'check' : 'grid'} size={16} />
          {editing ? 'Terminé' : 'Personnaliser'}
        </button>
      </header>

      <InstallBanner />

      {editing && (
        <div className="card pad home-editor">
          <p className="muted" style={{ marginBottom: 12 }}>
            Choisis ce que tu veux retrouver ici, et dans quel ordre.
          </p>
          {blocks.map((b, i) => (
            <div key={b.id} className="home-editor-row">
              <label className="row" style={{ flex: 1, cursor: 'pointer' }}>
                <input type="checkbox" checked={b.visible} onChange={() => toggle(i)} />
                {BLOCK_LABEL[b.id]}
              </label>
              <button className="btn ghost icon sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter">
                <Icon name="chevronDown" size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button className="btn ghost icon sm" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Descendre">
                <Icon name="chevronDown" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="home-grid">
        {blocks
          .filter((b) => b.visible)
          .map((b) => (
            <Block key={b.id} id={b.id} />
          ))}
      </div>
    </div>
  )
}

function Block({ id }: { id: HomeBlock['id'] }) {
  switch (id) {
    case 'today':
      return <TodayBlock />
    case 'capture':
      return <CaptureBlock />
    case 'recent':
      return <RecentBlock />
    case 'wish':
      return <WishBlock />
    case 'journal':
      return <JournalBlock />
    case 'moodboard':
      return <MoodboardBlock />
    case 'treasure':
      return <TreasureBlock />
    case 'projects':
      return <ProjectsBlock />
    case 'song':
      return <SongBlock />
  }
}

function Panel({ title, icon, to, children, className = '' }: { title: string; icon: string; to?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card home-panel ${className}`}>
      <div className="home-panel-head">
        <Icon name={icon} size={17} />
        <h3>{title}</h3>
        {to && (
          <Link to={to} className="home-more">
            Voir tout <Icon name="arrowRight" size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function TodayBlock() {
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const tasks = useLiveQuery(() => db.tasks.filter((t) => !t.done && !t.trashedAt).toArray(), []) ?? []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const occ = useMemo(() => occurrences(events, start, addDays(start, 8)), [events]) // eslint-disable-line react-hooks/exhaustive-deps
  const todayStr = ymd()
  const todays = occ.filter((o) => o.date === todayStr)
  const upcoming = occ.filter((o) => o.date !== todayStr).slice(0, 4)
  const todayTasks = tasks.filter((t) => t.date && t.date <= todayStr)

  return (
    <Panel title="Aujourd’hui" icon="calendar" to="/calendrier" className="span-2">
      {todays.length === 0 && todayTasks.length === 0 ? (
        <p className="muted home-calm">Rien de prévu aujourd’hui. Une journée à composer comme tu veux.</p>
      ) : (
        <ul className="home-events">
          {todays.map((o) => (
            <li key={o.key}>
              <span className="dot" style={{ background: o.event.color }} />
              <span className="time">{o.event.allDay ? 'Journée' : fmtTime(o.start)}</span>
              <span>{o.event.title}</span>
            </li>
          ))}
          {todayTasks.map((t) => (
            <li key={t.id}>
              <button className="home-check" onClick={() => db.tasks.update(t.id, { done: true, updatedAt: Date.now() })} aria-label="Marquer comme fait" />
              <span className="time">À faire</span>
              <span>{t.title}</span>
            </li>
          ))}
        </ul>
      )}
      {upcoming.length > 0 && (
        <>
          <div className="eyebrow" style={{ margin: '18px 0 8px' }}>
            À venir
          </div>
          <ul className="home-events soft">
            {upcoming.map((o) => (
              <li key={o.key}>
                <span className="dot" style={{ background: o.event.color }} />
                <span className="time">{capitalize(fmtLongDate(o.start).split(' ').slice(0, 2).join(' '))}</span>
                <span>{o.event.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

function CaptureBlock() {
  const [text, setText] = useState('')
  const { toast } = useUI()
  const save = async () => {
    if (!text.trim()) return
    await captureTo('note', text.trim())
    setText('')
    toast('Idée notée dans ta boîte d’entrée')
  }
  return (
    <Panel title="Une idée ?" icon="sparkle">
      <textarea
        className="textarea home-capture"
        placeholder="Note-la ici, tu la classeras plus tard…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
        }}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <span className="faint desktop-only" style={{ fontSize: '0.78rem' }}>
          Ctrl + Entrée
        </span>
        <span className="spacer" />
        <button className="btn primary sm" onClick={save} disabled={!text.trim()}>
          Garder
        </button>
      </div>
    </Panel>
  )
}

function RecentBlock() {
  const navigate = useNavigate()
  const items =
    useLiveQuery(async () => {
      const [notes, projects, boards] = await Promise.all([
        db.notes.filter((n) => !n.trashedAt).toArray(),
        db.projects.toArray(),
        db.moodboards.toArray(),
      ])
      return [
        ...notes.map((n) => ({ key: 'n' + n.id, title: n.title || 'Sans titre', icon: 'book', at: n.openedAt ?? n.updatedAt, to: `/notes/${n.id}` })),
        ...projects.map((p) => ({ key: 'p' + p.id, title: p.title || 'Projet', icon: 'kanban', at: p.openedAt ?? p.updatedAt, to: `/projets/${p.id}` })),
        ...boards.map((m) => ({ key: 'm' + m.id, title: m.title || 'Moodboard', icon: 'image', at: m.openedAt ?? m.updatedAt, to: `/moodboards/${m.id}` })),
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, 6)
    }, []) ?? []

  return (
    <Panel title="Récemment ouverts" icon="clock" className="span-2">
      {items.length === 0 ? (
        <p className="muted home-calm">Tes notes, projets et moodboards apparaîtront ici.</p>
      ) : (
        <div className="home-recent">
          {items.map((it) => (
            <button key={it.key} className="home-recent-item" onClick={() => navigate(it.to)}>
              <Icon name={it.icon} size={16} />
              <span className="t">{it.title}</span>
              <span className="faint">{relative(it.at)}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

function WishBlock() {
  const navigate = useNavigate()
  const wishes = useLiveQuery(() => db.wishes.filter((w) => w.state !== 'done').toArray(), []) ?? []
  const [seed, setSeed] = useState(() => Math.random())
  const wish = wishes.length ? wishes[Math.floor(seed * wishes.length)] : null
  const img = useAssetUrl(wish?.imageId)

  return (
    <Panel title="Une envie" icon="scroll" to="/parchemin">
      {!wish ? (
        <p className="muted home-calm">Ton parchemin attend ta première envie.</p>
      ) : (
        <div className="home-wish" onClick={() => navigate(`/parchemin?envie=${wish.id}`)}>
          {img && <img src={img} alt="" />}
          <div className="hand" style={{ fontSize: '1.1rem' }}>
            {wish.emoji} {wish.category}
          </div>
          <div className="home-wish-title">{wish.title || 'Une envie sans nom'}</div>
          <span className="chip neutral">{WISH_STATES[wish.state].label}</span>
        </div>
      )}
      {wishes.length > 1 && (
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setSeed(Math.random())}>
          <Icon name="repeat" size={14} /> Une autre
        </button>
      )}
    </Panel>
  )
}

function JournalBlock() {
  const navigate = useNavigate()
  const todayStr = ymd()
  const entry = useLiveQuery(() => db.journal.where('date').equals(todayStr).first(), [todayStr])
  const open = async () => {
    if (entry) return navigate(`/journal/${entry.id}`)
    const e = { ...base(), date: todayStr, content: null, text: '', highlights: [], prides: [], answers: {}, photoIds: [], mood: null }
    await db.journal.add(e)
    navigate(`/journal/${e.id}`)
  }
  return (
    <Panel title="Journal" icon="feather" to="/journal">
      <p className="muted" style={{ marginBottom: 14 }}>
        {entry?.text.trim() ? `« ${entry.text.trim().slice(0, 110)}${entry.text.trim().length > 110 ? '…' : ''} »` : 'Qu’as-tu envie de garder de cette journée ?'}
      </p>
      <button className="btn sm" onClick={open}>
        <Icon name="feather" size={15} /> {entry ? 'Continuer la page du jour' : 'Écrire la page du jour'}
      </button>
    </Panel>
  )
}

function MoodboardBlock() {
  const navigate = useNavigate()
  const board = useLiveQuery(async () => {
    const all = await db.moodboards.toArray()
    return all.find((m) => m.featured) ?? all.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  }, [])
  return (
    <Panel title="Moodboard à la une" icon="image" to="/moodboards">
      {!board ? (
        <p className="muted home-calm">Compose ton premier moodboard pour le voir ici.</p>
      ) : (
        <div className="home-board" onClick={() => navigate(`/moodboards/${board.id}`)}>
          <MoodboardThumb board={board} />
          <div className="home-board-title">{board.title || 'Moodboard'}</div>
        </div>
      )}
    </Panel>
  )
}

function TreasureBlock() {
  const items = useLiveQuery(() => db.treasures.toArray(), []) ?? []
  const [seed] = useState(() => Math.random())
  const t = items.length ? items[Math.floor(seed * items.length)] : null
  const img = useAssetUrl(t?.imageId)
  return (
    <Panel title="Un petit bonheur" icon="heart" to="/bonheurs">
      {!t ? (
        <p className="muted home-calm">Garde ici des phrases, souvenirs et petites victoires qui te font du bien.</p>
      ) : (
        <div className="home-treasure">
          {img && <img src={img} alt="" />}
          <p>{t.text}</p>
        </div>
      )}
    </Panel>
  )
}

function ProjectsBlock() {
  const navigate = useNavigate()
  const settings = useSettings()
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.trashedAt).toArray(), []) ?? []
  const active = projects.filter((p) => p.status === 'encours').slice(0, 4)
  return (
    <Panel title="Projets en cours" icon="kanban" to="/projets">
      {active.length === 0 ? (
        <p className="muted home-calm">Aucun projet en cours. Une envie pourrait en devenir un.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {active.map((p) => (
            <button key={p.id} className="home-project" onClick={() => navigate(`/projets/${p.id}`)}>
              <CoverView cover={p.cover} className="home-project-cover" />
              <span>{p.title}</span>
              <span className="faint" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>
                {settings.projectColumns.find((c) => c.id === p.status)?.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

function SongBlock() {
  const navigate = useNavigate()
  const song = useLiveQuery(async () => {
    const all = await db.songs.toArray()
    return all.sort((a, b) => Math.max(b.lastPracticeAt ?? 0, b.openedAt ?? 0, b.updatedAt) - Math.max(a.lastPracticeAt ?? 0, a.openedAt ?? 0, a.updatedAt))[0] ?? null
  }, [])
  return (
    <Panel title="Reprendre un morceau" icon="music" to="/synthe">
      {!song ? (
        <>
          <p className="muted home-calm" style={{ marginBottom: 12 }}>Écris ton premier morceau dans l’atelier synthé.</p>
          <button className="btn sm" onClick={() => navigate('/synthe')}>
            <Icon name="music" size={15} /> Ouvrir l’atelier
          </button>
        </>
      ) : (
        <div className="home-wish" onClick={() => navigate(`/synthe/${song.id}`)}>
          <MiniRoll song={song} height={70} />
          <div className="home-wish-title" style={{ marginTop: 10, fontSize: '1.15rem' }}>{song.title || 'Sans titre'}</div>
          <div className="row">
            <span className="faint" style={{ fontSize: '0.8rem' }}>♩ {song.bpm} · {song.lastPracticeAt ? `joué ${relative(song.lastPracticeAt)}` : 'pas encore joué'}</span>
            <span className="spacer" />
            <button className="btn primary sm">▶ Reprendre</button>
          </div>
        </div>
      )}
    </Panel>
  )
}

function InstallBanner() {
  const { canInstall, install } = useInstall()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('minion:hideInstall') === '1'
    } catch {
      return false
    }
  })
  if (hidden) return null
  if (!canInstall) return null
  return (
    <div className="card install-banner">
      <Mascot size={52} />
      <div style={{ flex: 1 }}>
        <h3>Installer Minion sur cet ordinateur</h3>
        <p className="muted">Une icône sur le bureau, une fenêtre rien qu’à toi, et ça marche même sans internet.</p>
      </div>
      <button className="btn primary" onClick={install}>
        Installer
      </button>
      <button
        className="btn ghost icon sm"
        aria-label="Plus tard"
        title="Plus tard"
        onClick={() => {
          setHidden(true)
          try {
            localStorage.setItem('minion:hideInstall', '1')
          } catch {
            /* rien */
          }
        }}
      >
        <Icon name="x" size={15} />
      </button>
    </div>
  )
}

