import { useEffect, useState } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { db, requestPersistence } from './db/db'
import { applyTheme, getSettings, useSettings } from './db/settings'
import { Layout } from './components/Layout'
import { Splash } from './components/Splash'
import { UIProvider } from './components/ui'
import { HomePage } from './features/home/HomePage'

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [{ index: true, element: <HomePage /> }],
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
      // Ses propres phrases (trésor) rejoignent le tirage de l'ouverture
      const mine = await db.treasures.where('kind').equals('phrase').toArray()
      setExtra(mine.map((t) => t.text).filter(Boolean))
      setShowSplash(s.splash)
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
