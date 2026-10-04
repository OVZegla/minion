import { useEffect, useState } from 'react'
import { db, uid } from './db'

const MAX_SIDE = 2200

/** Réduit les très grandes images pour garder la base légère. */
async function downscale(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 1.5e6) return file
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.88))
    return out ?? file
  } catch {
    return file
  }
}

export async function saveAsset(file: File): Promise<string> {
  const id = uid()
  const blob = await downscale(file)
  await db.assets.put({ id, createdAt: Date.now(), name: file.name, type: blob.type || file.type, blob })
  return id
}

const cache = new Map<string, string>()

export async function assetUrl(id: string): Promise<string | null> {
  if (cache.has(id)) return cache.get(id)!
  const a = await db.assets.get(id)
  if (!a) return null
  const url = URL.createObjectURL(a.blob)
  cache.set(id, url)
  return url
}

export function useAssetUrl(id?: string | null) {
  const [url, setUrl] = useState<string | null>(id ? cache.get(id) ?? null : null)
  useEffect(() => {
    let alive = true
    if (!id) {
      setUrl(null)
      return
    }
    assetUrl(id).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [id])
  return url
}

/** Ouvre le sélecteur de fichiers. */
export function pickFiles(accept = 'image/*', multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.click()
  })
}
