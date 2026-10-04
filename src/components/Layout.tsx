import { Fragment, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import { Icon } from './Icon'
import { Mascot } from './Mascot'
import { useUI } from './ui'
import { useReminders } from '../features/calendar/reminders'
import { useInstall } from '../lib/install'
import { deName } from '../lib/phrases'
import { QuickCapture } from './QuickCapture'
import { SearchPalette } from './SearchPalette'
import './layout.css'

const NAV = [
  { to: '/', icon: 'home', label: 'Accueil', end: true },
  { to: '/boite', icon: 'inbox', label: 'Boîte d’entrée', badge: 'inbox' as const },
  { to: '/notes', icon: 'book', label: 'Bibliothèque' },
  { to: '/parchemin', icon: 'scroll', label: 'Mon parchemin' },
  { to: '/projets', icon: 'kanban', label: 'Projets' },
  { to: '/moodboards', icon: 'image', label: 'Moodboards' },
  { to: '/calendrier', icon: 'calendar', label: 'Calendrier' },
  { to: '/journal', icon: 'feather', label: 'Journal' },
  { to: '/pensees', icon: 'cloud', label: 'Pensées à plat' },
  { to: '/synthe', icon: 'music', label: 'Atelier synthé', group: 'Créer et apprendre' },
  { to: '/apprendre', icon: 'target', label: 'Apprendre' },
  { to: '/plume', icon: 'pen', label: 'Atelier plume' },
  { to: '/studio', icon: 'palette', label: 'Studio graphique' },
]

/** Espaces de travail plein écran (sans le menu de Minion). */
const IMMERSIVE = /^\/(plume\/[^/]+|studio\/[^/]+)/

export function Layout() {
  const settings = useSettings()
  const { toast } = useUI()
  const { canInstall, install } = useInstall()
  const [capture, setCapture] = useState(false)
  const [search, setSearch] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const loc = useLocation()
  const navigate = useNavigate()
  const inboxCount = useLiveQuery(() => db.notes.filter((n) => n.inbox && !n.trashedAt).count(), []) ?? 0

  useEffect(() => setMobileNav(false), [loc.pathname])
  useReminders(toast)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setCapture(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`shell ${IMMERSIVE.test(loc.pathname) ? 'immersive' : ''}`}>
      <aside className={`sidebar no-print ${mobileNav ? 'open' : ''}`}>
        <div className="brand" onClick={() => navigate('/')}>
          <Mascot size={34} className="brand-mascot" />
          <div>
            <div className="brand-name">Minion</div>
            <div className="brand-sub">l’univers {deName(settings.name)}</div>
          </div>
        </div>

        <button className="side-action" onClick={() => setSearch(true)}>
          <Icon name="search" size={16} />
          <span>Rechercher</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="side-action capture" onClick={() => setCapture(true)}>
          <Icon name="plus" size={16} />
          <span>Noter une idée</span>
        </button>

        <nav className="side-nav">
          {NAV.map((n) => (
            <Fragment key={n.to}>
            {'group' in n && n.group && <div className="side-group">{n.group}</div>}
            <NavLink to={n.to} end={n.end} className={({ isActive }) => `side-link ${isActive || (n.to === "/pensees" && loc.pathname === "/bonheurs") ? "active" : ""}`}>
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
              {n.badge === 'inbox' && inboxCount > 0 && <span className="side-badge">{inboxCount}</span>}
            </NavLink>
            </Fragment>
          ))}
        </nav>

        <div className="side-bottom">
          {canInstall && (
            <button className="side-install" onClick={install}>
              <Mascot size={26} />
              <span>
                <b>Installer Minion</b>
                <small>sur cet ordinateur, en 1 clic</small>
              </span>
            </button>
          )}
          <NavLink to="/reglages" className="side-link">
            <Icon name="settings" size={18} />
            <span>Réglages</span>
          </NavLink>
        </div>
      </aside>
      {mobileNav && <div className="sidebar-scrim" onClick={() => setMobileNav(false)} />}

      <main className="main">
        <Outlet />
      </main>

      {/* Barre basse sur téléphone */}
      <nav className="bottom-bar no-print">
        <NavLink to="/" end className="bb-link">
          <Icon name="home" size={20} />
          <span>Accueil</span>
        </NavLink>
        <NavLink to="/calendrier" className="bb-link">
          <Icon name="calendar" size={20} />
          <span>Agenda</span>
        </NavLink>
        <button className="bb-capture" onClick={() => setCapture(true)} aria-label="Noter une idée">
          <Icon name="plus" size={24} />
        </button>
        <NavLink to="/journal" className="bb-link">
          <Icon name="feather" size={20} />
          <span>Journal</span>
        </NavLink>
        <button className="bb-link" onClick={() => setMobileNav(true)}>
          <Icon name="menu" size={20} />
          <span>Plus</span>
        </button>
      </nav>

      <QuickCapture open={capture} onClose={() => setCapture(false)} />
      <SearchPalette open={search} onClose={() => setSearch(false)} />
    </div>
  )
}
