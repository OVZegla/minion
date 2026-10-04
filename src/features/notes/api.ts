import { base, db } from '../../db/db'
import { removeAllLinks } from '../../db/links'
import type { Note } from '../../db/types'

export async function createNote(partial: Partial<Note> = {}): Promise<Note> {
  const n: Note = {
    ...base(),
    title: '',
    content: null,
    text: '',
    tags: [],
    favorite: false,
    inbox: false,
    folderId: null,
    cover: null,
    ...partial,
  }
  await db.notes.add(n)
  return n
}

/** Capture rapide : la première ligne devient le titre, le reste le contenu. Va dans la boîte d'entrée. */
export async function captureIdea(raw: string, extra: Partial<Note> = {}) {
  const lines = raw.trim().split('\n')
  const title = lines[0].slice(0, 140)
  const rest = lines.slice(1).join('\n').trim()
  return createNote({
    title,
    text: rest,
    content: rest ? textToDoc(rest) : null,
    inbox: true,
    ...extra,
  })
}

export function textToDoc(text: string) {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
  }
}

export async function trashNote(id: string) {
  await db.notes.update(id, { trashedAt: Date.now() })
}
export async function restoreNote(id: string) {
  await db.notes.update(id, { trashedAt: null })
}
export async function deleteNoteForever(id: string) {
  await db.notes.delete(id)
  await removeAllLinks('note', id)
}
