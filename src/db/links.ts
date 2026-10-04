import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from './db'
import type { EntityType, Link } from './types'

/** Relie deux contenus (sans doublon). Les liens sont bidirectionnels à la lecture. */
export async function link(aType: EntityType, aId: string, bType: EntityType, bId: string) {
  const existing = await findLink(aType, aId, bType, bId)
  if (existing) return existing.id
  const l: Link = { id: uid(), fromType: aType, fromId: aId, toType: bType, toId: bId, createdAt: Date.now() }
  await db.links.add(l)
  return l.id
}

async function findLink(aType: EntityType, aId: string, bType: EntityType, bId: string) {
  const out = await db.links.where('[fromType+fromId]').equals([aType, aId]).toArray()
  const hit = out.find((l) => l.toType === bType && l.toId === bId)
  if (hit) return hit
  const back = await db.links.where('[fromType+fromId]').equals([bType, bId]).toArray()
  return back.find((l) => l.toType === aType && l.toId === aId)
}

export async function unlink(aType: EntityType, aId: string, bType: EntityType, bId: string) {
  const l = await findLink(aType, aId, bType, bId)
  if (l) await db.links.delete(l.id)
}

export interface Linked {
  type: EntityType
  id: string
}

export async function getLinks(type: EntityType, id: string): Promise<Linked[]> {
  const [a, b] = await Promise.all([
    db.links.where('[fromType+fromId]').equals([type, id]).toArray(),
    db.links.where('[toType+toId]').equals([type, id]).toArray(),
  ])
  return [...a.map((l) => ({ type: l.toType, id: l.toId })), ...b.map((l) => ({ type: l.fromType, id: l.fromId }))]
}

export function useLinks(type: EntityType, id: string | undefined) {
  return useLiveQuery(() => (id ? getLinks(type, id) : Promise.resolve([] as Linked[])), [type, id]) ?? []
}

/** Supprime tous les liens d'un contenu (lors d'une suppression définitive). */
export async function removeAllLinks(type: EntityType, id: string) {
  await db.links.where('[fromType+fromId]').equals([type, id]).delete()
  await db.links.where('[toType+toId]').equals([type, id]).delete()
}
