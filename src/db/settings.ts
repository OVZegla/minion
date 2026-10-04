import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  name: 'Einat',
  accent: 'rose',
  theme: 'jour',
  splash: true,
  homeBlocks: [
    { id: 'today', visible: true },
    { id: 'capture', visible: true },
    { id: 'recent', visible: true },
    { id: 'wish', visible: true },
    { id: 'journal', visible: true },
    { id: 'moodboard', visible: true },
    { id: 'treasure', visible: false },
    { id: 'projects', visible: false },
  ],
  projectColumns: [
    { id: 'idee', name: 'Idée' },
    { id: 'encours', name: 'En cours' },
    { id: 'pause', name: 'En pause' },
    { id: 'fini', name: 'Terminé' },
  ],
  wishCategories: ['Voyage', 'Expérience', 'Apprendre', 'Créer', 'Maison', 'Business', 'Moment', 'Rêve'],
  eventKinds: [
    { id: 'rdv', name: 'Rendez-vous', color: '#7f9db5' },
    { id: 'sortie', name: 'Sortie', color: '#c8805f' },
    { id: 'activite', name: 'Activité', color: '#8fa58a' },
    { id: 'creation', name: 'Temps de création', color: '#a397c4' },
    { id: 'synthe', name: 'Séance de synthé', color: '#c9a46a' },
    { id: 'projet', name: 'Étape de projet', color: '#5b534b' },
    { id: 'moi', name: 'Moment pour moi', color: '#c98b8b' },
  ],
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return { ...DEFAULT_SETTINGS, ...s }
}

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('settings'), [])
  return { ...DEFAULT_SETTINGS, ...s }
}

export async function updateSettings(patch: Partial<Settings>) {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings' })
}

export function applyTheme(s: Settings) {
  const root = document.documentElement
  if (s.accent === 'rose') root.removeAttribute('data-accent')
  else root.setAttribute('data-accent', s.accent)
  root.setAttribute('data-theme', s.theme)
}
