import Dexie, { type Table } from 'dexie'
import type {
  Asset,
  CalendarEvent,
  Folder,
  JournalEntry,
  Link,
  Moodboard,
  Note,
  Palette,
  Project,
  Settings,
  Task,
  Thought,
  Treasure,
  Wish,
  Song,
  Deck,
} from './types'
import type { GraphicDoc } from '../features/studio/types'

class MinionDB extends Dexie {
  notes!: Table<Note, string>
  folders!: Table<Folder, string>
  wishes!: Table<Wish, string>
  projects!: Table<Project, string>
  tasks!: Table<Task, string>
  events!: Table<CalendarEvent, string>
  journal!: Table<JournalEntry, string>
  thoughts!: Table<Thought, string>
  treasures!: Table<Treasure, string>
  moodboards!: Table<Moodboard, string>
  palettes!: Table<Palette, string>
  assets!: Table<Asset, string>
  links!: Table<Link, string>
  settings!: Table<Settings, string>
  songs!: Table<Song, string>
  decks!: Table<Deck, string>
  kv!: Table<{ id: string; value: unknown }, string>
  graphics!: Table<GraphicDoc, string>

  constructor() {
    super('minion')
    this.version(1).stores({
      notes: 'id, updatedAt, openedAt, folderId, favorite, inbox, *tags, trashedAt',
      folders: 'id, parentId',
      wishes: 'id, state, category, order, updatedAt',
      projects: 'id, status, order, updatedAt, openedAt',
      tasks: 'id, date, projectId, done, order',
      events: 'id, start, recurrence',
      journal: 'id, date, updatedAt',
      thoughts: 'id, group, createdAt',
      treasures: 'id, kind, createdAt',
      moodboards: 'id, updatedAt, openedAt',
      palettes: 'id, updatedAt',
      assets: 'id',
      links: 'id, [fromType+fromId], [toType+toId]',
      settings: 'id',
    })
    // v2 : atelier synthé et apprentissage
    this.version(2).stores({
      songs: 'id, updatedAt, openedAt',
      decks: 'id, updatedAt',
    })
    // v3 : préférences et progressions diverses (atelier plume…)
    this.version(3).stores({ kv: 'id' })
    // v4 : studio graphique
    this.version(4).stores({ graphics: 'id, updatedAt, openedAt' })
  }
}

export const db = new MinionDB()

export const uid = () => crypto.randomUUID()
export const now = () => Date.now()

/** Champs communs pour une nouvelle entité */
export function base() {
  const t = now()
  return { id: uid(), createdAt: t, updatedAt: t, trashedAt: null }
}

/** Demande au navigateur de ne pas effacer les données sous pression de stockage. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist()
  } catch {
    /* sans conséquence */
  }
}
