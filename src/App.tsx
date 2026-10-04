import { useEffect, useState } from 'react'
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
      { path: 'apprendre/:id', element: <DeckPage /> },
      { path: 'reglages', element: <SettingsPage /> },
      { path: '*', element: <ErrorPage /> },
    ],
  },
])

export function App() {
  const settings = useSettings()
  const [ready, setReady] = useState(false)
  const [showSplash, setShowSplash] = useState(false)
  const [extra, setExtra] = useState<string[]>([])

  useEffect(() => {
    ;(async () => {
      const s = await getSettings()
      applyTheme(s)
      // Ses propres phrases (petits bonheurs) rejoignent le tirage de l'ouverture
      const mine = await db.treasures.where('kind').equals('phrase').toArray()
      setExtra(mine.map((t) => t.text).filter(Boolean))
      setShowSplash(s.splash && !location.search.includes('nosplash'))
      setReady(true)
      requestPersistence()
    })()
  }, [])

  useEffect(() => applyTheme(settings), [settings.accent, settings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null

  return (
    <UIProvider>
      <RouterProvider router={router} />
      {showSplash && <Splash name={settings.name} extraPhrases={extra} onDone={() => setShowSplash(false)} />}
    </UIProvider>
  )
}
