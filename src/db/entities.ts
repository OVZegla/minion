import { db } from './db'
import type { EntityType } from './types'

/** Registre des types de contenus : libellés, icônes, routes, titres. */
export const ENTITY: Record<
  EntityType,
  { label: string; plural: string; icon: string; route: (id: string) => string; linkable: boolean }
> = {
  note: { label: 'Note', plural: 'Notes', icon: 'book', route: (id) => `/notes/${id}`, linkable: true },
  wish: { label: 'Envie', plural: 'Envies', icon: 'scroll', route: (id) => `/parchemin?envie=${id}`, linkable: true },
  project: { label: 'Projet', plural: 'Projets', icon: 'kanban', route: (id) => `/projets/${id}`, linkable: true },
  moodboard: { label: 'Moodboard', plural: 'Moodboards', icon: 'image', route: (id) => `/moodboards/${id}`, linkable: true },
  event: { label: 'Événement', plural: 'Événements', icon: 'calendar', route: (id) => `/calendrier?evt=${id}`, linkable: true },
  task: { label: 'Tâche', plural: 'Tâches', icon: 'check', route: () => `/calendrier`, linkable: false },
  journal: { label: 'Page de journal', plural: 'Journal', icon: 'feather', route: (id) => `/journal/${id}`, linkable: true },
  thought: { label: 'Pensée', plural: 'Pensées', icon: 'cloud', route: () => `/pensees`, linkable: false },
  song: { label: 'Morceau', plural: 'Morceaux', icon: 'music', route: (id) => `/synthe/${id}`, linkable: true },
  deck: { label: 'Série de révision', plural: 'Apprendre', icon: 'target', route: (id) => `/apprendre/${id}`, linkable: true },
  treasure: { label: 'Petit bonheur', plural: 'Petits bonheurs', icon: 'heart', route: () => `/bonheurs`, linkable: false },
}

export const LINKABLE: EntityType[] = ['note', 'wish', 'project', 'moodboard', 'event', 'journal', 'song', 'deck']

export interface EntitySummary {
  type: EntityType
  id: string
  title: string
  sub?: string
  updatedAt?: number
}

export async function summarize(type: EntityType, id: string): Promise<EntitySummary | null> {
  switch (type) {
    case 'note': {
      const n = await db.notes.get(id)
      return n && !n.trashedAt ? { type, id, title: n.title || 'Sans titre', sub: n.text.slice(0, 80), updatedAt: n.updatedAt } : null
    }
    case 'wish': {
      const w = await db.wishes.get(id)
      return w ? { type, id, title: w.title || 'Envie', sub: w.category, updatedAt: w.updatedAt } : null
    }
    case 'project': {
      const p = await db.projects.get(id)
      return p ? { type, id, title: p.title || 'Projet', sub: p.intention, updatedAt: p.updatedAt } : null
    }
    case 'moodboard': {
      const m = await db.moodboards.get(id)
      return m ? { type, id, title: m.title || 'Moodboard', updatedAt: m.updatedAt } : null
    }
    case 'event': {
      const e = await db.events.get(id)
      return e ? { type, id, title: e.title || 'Événement', sub: e.start.replace('T', ' '), updatedAt: e.updatedAt } : null
    }
    case 'journal': {
      const j = await db.journal.get(id)
      return j ? { type, id, title: j.title || j.date, sub: j.text.slice(0, 80), updatedAt: j.updatedAt } : null
    }
    case 'task': {
      const t = await db.tasks.get(id)
      return t ? { type, id, title: t.title } : null
    }
    case 'thought': {
      const t = await db.thoughts.get(id)
      return t ? { type, id, title: t.text.slice(0, 60) } : null
    }
    case 'song': {
      const s = await db.songs.get(id)
      return s ? { type, id, title: s.title || 'Morceau', sub: `${s.bpm} BPM · ${s.timeSig.join('/')}`, updatedAt: s.updatedAt } : null
    }
    case 'deck': {
      const d = await db.decks.get(id)
      return d ? { type, id, title: d.title || 'Révision', sub: `${d.cards.length} cartes`, updatedAt: d.updatedAt } : null
    }
    case 'treasure': {
      const t = await db.treasures.get(id)
      return t ? { type, id, title: t.text.slice(0, 60) } : null
    }
  }
}

/** Liste des contenus reliables, pour le sélecteur de liens et la recherche. */
export async function listLinkable(): Promise<EntitySummary[]> {
  const [notes, wishes, projects, boards, events, journal, songs, decks] = await Promise.all([
    db.notes.toArray(),
    db.wishes.toArray(),
    db.projects.toArray(),
    db.moodboards.toArray(),
    db.events.toArray(),
    db.journal.toArray(),
    db.songs.toArray(),
    db.decks.toArray(),
  ])
  return [
    ...notes.filter((n) => !n.trashedAt).map((n) => ({ type: 'note' as const, id: n.id, title: n.title || 'Sans titre', sub: n.text.slice(0, 120), updatedAt: n.updatedAt })),
    ...wishes.map((w) => ({ type: 'wish' as const, id: w.id, title: w.title || 'Envie', sub: w.description, updatedAt: w.updatedAt })),
    ...projects.map((p) => ({ type: 'project' as const, id: p.id, title: p.title || 'Projet', sub: p.intention, updatedAt: p.updatedAt })),
    ...boards.map((m) => ({ type: 'moodboard' as const, id: m.id, title: m.title || 'Moodboard', updatedAt: m.updatedAt })),
    ...events.map((e) => ({ type: 'event' as const, id: e.id, title: e.title || 'Événement', sub: e.start.replace('T', ' à '), updatedAt: e.updatedAt })),
    ...journal.map((j) => ({ type: 'journal' as const, id: j.id, title: j.title || `Journal du ${j.date}`, sub: j.text.slice(0, 120), updatedAt: j.updatedAt })),
    ...songs.map((s) => ({ type: 'song' as const, id: s.id, title: s.title || 'Morceau', sub: `${s.bpm} BPM`, updatedAt: s.updatedAt })),
    ...decks.map((d) => ({ type: 'deck' as const, id: d.id, title: d.title || 'Révision', sub: d.topic, updatedAt: d.updatedAt })),
  ]
}
