import { normalize } from '../../components/SearchPalette'
import type { Folder, Note } from '../../db/types'

const STOP = new Set(
  'le la les un une des de du et ou a au aux en dans pour par sur avec sans ce cet cette ces mon ma mes ton ta tes son sa ses je tu il elle on nous vous ils elles qui que quoi est sont etre avoir fait faire plus tres comme mais donc car ne pas ni si y d l j c s n qu'.split(' '),
)

function words(s: string) {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

export interface Suggestion {
  folderIds: string[]
  tags: string[]
}

/**
 * Assistance au classement, simple et locale (sans IA) :
 * compare les mots de la note avec ceux des notes déjà classées
 * et propose des dossiers et tags qu'elle peut accepter ou ignorer.
 */
export function suggestClassification(note: Note, all: Note[], folders: Folder[]): Suggestion {
  const mine = new Set(words(`${note.title} ${note.text}`))
  if (!mine.size) return { folderIds: [], tags: [] }
  const folderScore = new Map<string, number>()
  const tagScore = new Map<string, number>()

  for (const f of folders) {
    const overlap = words(f.name).filter((w) => mine.has(w)).length
    if (overlap) folderScore.set(f.id, (folderScore.get(f.id) ?? 0) + overlap * 3)
  }
  for (const other of all) {
    if (other.id === note.id || other.inbox || other.trashedAt) continue
    const ow = new Set(words(`${other.title} ${other.text}`))
    let overlap = 0
    mine.forEach((w) => ow.has(w) && overlap++)
    if (!overlap) continue
    if (other.folderId) folderScore.set(other.folderId, (folderScore.get(other.folderId) ?? 0) + overlap)
    other.tags.forEach((t) => tagScore.set(t, (tagScore.get(t) ?? 0) + overlap))
  }
  // un tag qui apparaît mot pour mot dans la note est très pertinent
  const allTags = new Set(all.flatMap((n) => n.tags))
  allTags.forEach((t) => {
    if (mine.has(normalize(t))) tagScore.set(t, (tagScore.get(t) ?? 0) + 5)
  })

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .filter(([, s]) => s >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k)
  return { folderIds: top(folderScore, 2), tags: top(tagScore, 4).filter((t) => !note.tags.includes(t)) }
}
