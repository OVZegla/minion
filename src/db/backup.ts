import { db } from './db'

const TABLES = ['notes', 'folders', 'wishes', 'projects', 'tasks', 'events', 'journal', 'thoughts', 'treasures', 'moodboards', 'palettes', 'links', 'settings', 'songs', 'decks', 'kv'] as const

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(b)
  })
}

/** Exporte tout (images comprises) dans un seul fichier JSON. */
export async function exportAll(): Promise<Blob> {
  const data: Record<string, unknown> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  const assets = await db.assets.toArray()
  data.assets = await Promise.all(assets.map(async (a) => ({ ...a, blob: await blobToDataUrl(a.blob) })))
  return new Blob([JSON.stringify({ app: 'minion', version: 1, exportedAt: new Date().toISOString(), data })], { type: 'application/json' })
}

export async function downloadBackup() {
  const blob = await exportAll()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const d = new Date()
  a.download = `minion-sauvegarde-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  try {
    localStorage.setItem('minion:lastBackup', String(Date.now()))
  } catch {
    /* rien */
  }
}

/** Restaure une sauvegarde : remplace entièrement les données actuelles. */
export async function restoreBackup(file: File) {
  const json = JSON.parse(await file.text())
  if (json?.app !== 'minion' || !json.data) throw new Error('Ce fichier n’est pas une sauvegarde Minion.')
  const data = json.data as Record<string, unknown[]>
  const assets = await Promise.all(
    ((data.assets ?? []) as { blob: string }[]).map(async (a) => ({ ...a, blob: await (await fetch(a.blob)).blob() })),
  )
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.assets], async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      if (Array.isArray(data[t])) await db.table(t).bulkAdd(data[t])
    }
    await db.assets.clear()
    await db.assets.bulkAdd(assets as never[])
  })
}

export async function storageEstimate() {
  try {
    const e = await navigator.storage.estimate()
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false
    return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted }
  } catch {
    return null
  }
}
