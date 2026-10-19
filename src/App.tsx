import { lazy, Suspense, useEffect, useState } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { db, requestPersistence } from './db/db'
import { applyTheme, getSettings, useSettings } from './db/settings'
import { Layout } from './components/Layout'
import { ErrorPage } from './components/ErrorPage'
import { Splash } from './components/Splash'
import { UIProvider } from './components/ui'
import { HomePage } from './features/home/HomePage'
import { InboxPage } from './features/notes/InboxPage'
import { LibraryPage } from './features/notes/LibraryPage'
import { NoteEditorPage } from './features/notes/NoteEditorPage'
import { ParcheminPage } from './features/wishes/ParcheminPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { ProjectPage } from './features/projects/ProjectPage'
import { MoodboardsPage } from './features/moodboards/MoodboardsPage'
import { MoodboardEditorPage } from './features/moodboards/MoodboardEditor'
import { CalendarPage } from './features/calendar/CalendarPage'
import { JournalPage } from './features/journal/JournalPage'
import { JournalEntryPage } from './features/journal/JournalEntryPage'
import { ThoughtsPage } from './features/thoughts/ThoughtsPage'
import { TreasurePage } from './features/treasure/TreasurePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { SongsPage } from './features/synth/SongsPage'
import { SongEditorPage } from './features/synth/SongEditor'
import { LearnPage } from './features/learn/LearnPage'
import { DeckPage } from './features/learn/DeckPage'
import { PenHomePage, PenLevelPage } from './features/pen/PenGamePage'
import { StudioHome } from './features/studio/StudioHome'
import { StudioPage } from './features/studio/Studio'
import { LetterPage } from './features/letter/LetterPage'
import { BIRTHDAY_KEY, Birthday } from './features/birthday/Birthday'
import { MessagesPage } from './features/messages/MessagesPage'

// la 3D (three.js) n'est chargée qu'en ouvrant un plan
const RoomsHome = lazy(() => import('./features/rooms/RoomsHome').then((m) => ({ default: m.RoomsHome })))
const RoomPage = lazy(() => import('./features/rooms/RoomPage').then((m) => ({ default: m.RoomPage })))
// le studio musique (moteur audio, banque de sons) n'est chargé qu'à l'ouverture
const DawHome = lazy(() => import('./features/daw/DawHome').then((m) => ({ default: m.DawHome })))
const DawPage = lazy(() => import('./features/daw/Daw').then((m) => ({ default: m.DawPage })))
const wait = <div className="page empty">Ouverture…</div>

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'boite', element: <InboxPage /> },
      { path: 'notes', element: <LibraryPage /> },
      { path: 'notes/:id', element: <NoteEditorPage /> },
      { path: 'parchemin', element: <ParcheminPage /> },
      { path: 'projets', element: <ProjectsPage /> },
      { path: 'projets/:id', element: <ProjectPage /> },
      { path: 'moodboards', element: <MoodboardsPage /> },
      { path: 'moodboards/:id', element: <MoodboardEditorPage /> },
      { path: 'calendrier', element: <CalendarPage /> },
      { path: 'journal', element: <JournalPage /> },
      { path: 'journal/:id', element: <JournalEntryPage /> },
      { path: 'pensees', element: <ThoughtsPage /> },
      { path: 'bonheurs', element: <TreasurePage /> },
      { path: 'synthe', element: <SongsPage /> },
      { path: 'synthe/:id', element: <SongEditorPage /> },
      { path: 'apprendre', element: <LearnPage /> },
      { path: 'plume', element: <PenHomePage /> },
      { path: 'studio', element: <StudioHome /> },
      { path: 'pieces', element: <Suspense fallback={wait}><RoomsHome /></Suspense> },
      { path: 'pieces/:id', element: <Suspense fallback={wait}><RoomPage /></Suspense> },
      { path: 'studio/:id', element: <StudioPage /> },
      { path: 'musique', element: <Suspense fallback={wait}><DawHome /></Suspense> },
      { path: 'musique/:id', element: <Suspense fallback={wait}><DawPage /></Suspense> },
      { path: 'plume/:levelId', element: <PenLevelPage /> },
      { path: 'apprendre/:id', element: <DeckPage /> },
      { path: 'reglages', element: <SettingsPage /> },
      { path: 'lettre', element: <LetterPage /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: '*', element: <ErrorPage /> },
    ],
  },
])

export function App() {
  const settings = useSettings()
  const [ready, setReady] = useState(false)
  const [showSplash, setShowSplash] = useState(false)
  const [extra, setExtra] = useState<string[]>([])
  const [birthday, setBirthday] = useState(false)

  useEffect(() => {
    ;(async () => {
      const s = await getSettings()
      applyTheme(s)
      // Ses propres phrases (petits bonheurs) rejoignent le tirage de l'ouverture
      const mine = await db.treasures.where('kind').equals('phrase').toArray()
      setExtra(mine.map((t) => t.text).filter(Boolean))
      // la surprise d'anniversaire remplace l'ouverture habituelle, une seule fois
      const surprise = location.search.includes('anniversaire') || !(await db.kv.get(BIRTHDAY_KEY))
      setBirthday(surprise && !location.search.includes('nosplash'))
      setShowSplash(!surprise && s.splash && !location.search.includes('nosplash'))
      setReady(true)
      requestPersistence()
    })()
  }, [])

  // la surprise peut être revue depuis Messages
  useEffect(() => {
    const replay = () => setBirthday(true)
    window.addEventListener('minion:anniversaire', replay)
    return () => window.removeEventListener('minion:anniversaire', replay)
  }, [])

  useEffect(() => applyTheme(settings), [settings.accent, settings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null

  return (
    <UIProvider>
      <RouterProvider router={router} />
      {birthday && <Birthday name={settings.name || 'toi'} onDone={() => setBirthday(false)} />}
      {showSplash && <Splash name={settings.name} extraPhrases={extra} onDone={() => setShowSplash(false)} />}
    </UIProvider>
  )
}
