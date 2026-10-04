import { db } from '../../db/db'
import type { MoodItem } from '../../db/types'
import { shapePath } from './MoodItemView'

const FONTS: Record<string, string> = {
  display: '"Fraunces Variable", Georgia, serif',
  body: '"Inter Variable", "Segoe UI", sans-serif',
  hand: 'Caveat, cursive',
}

async function loadImage(id?: string): Promise<ImageBitmap | null> {
  if (!id) return null
  const a = await db.assets.get(id)
  if (!a) return null
  try {
    return await createImageBitmap(a.blob)
  } catch {
    return null
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line)
        line = word
      } else line = test
    }
    out.push(line)
  }
  return out
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

/** Dessine le moodboard sur un canvas (rendu fidèle aux éléments, sans dépendre du DOM). */
export async function renderBoard(background: string, items: MoodItem[], scale = 2): Promise<HTMLCanvasElement> {
  await document.fonts.ready
  const pad = 60
  const xs = items.flatMap((i) => [i.x, i.x + i.w])
  const ys = items.flatMap((i) => [i.y, i.y + i.h])
  const bx = items.length ? Math.min(...xs) - pad : 0
  const by = items.length ? Math.min(...ys) - pad : 0
  const bw = items.length ? Math.max(...xs) + pad - bx : 1200
  const bh = items.length ? Math.max(...ys) + pad - by : 800
  const c = document.createElement('canvas')
  c.width = Math.round(bw * scale)
  c.height = Math.round(bh * scale)
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, bw, bh)
  ctx.translate(-bx, -by)

  for (const it of [...items].sort((a, b) => a.z - b.z)) {
    ctx.save()
    ctx.translate(it.x + it.w / 2, it.y + it.h / 2)
    ctx.rotate((it.rotation * Math.PI) / 180)
    ctx.translate(-it.w / 2, -it.h / 2)
    const { w, h } = it
    switch (it.kind) {
      case 'image': {
        const img = await loadImage(it.imageId)
        if (img) drawCover(ctx, img, 0, 0, w, h)
        break
      }
      case 'shape':
        ctx.fillStyle = it.fill ?? '#f3e1df'
        ctx.fill(new Path2D(shapePath(it.shape, w, h)))
        break
      case 'text': {
        ctx.fillStyle = it.color ?? '#2e2a26'
        const fs = it.fontSize ?? 32
        ctx.font = `${it.font === 'body' ? 400 : 500} ${fs}px ${FONTS[it.font ?? 'display']}`
        ctx.textBaseline = 'top'
        wrap(ctx, it.text ?? '', w).forEach((l, i) => ctx.fillText(l, 0, i * fs * 1.2 + fs * 0.05))
        break
      }
      case 'note': {
        ctx.shadowColor = 'rgba(80,60,40,.15)'
        ctx.shadowBlur = 10
        ctx.shadowOffsetY = 4
        ctx.fillStyle = it.fill ?? '#fbf1c7'
        roundRect(ctx, 0, 0, w, h, 6)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        const fs = it.fontSize ?? 26
        ctx.fillStyle = it.color ?? '#5b4a3a'
        ctx.font = `500 ${fs}px ${FONTS.hand}`
        ctx.textBaseline = 'top'
        wrap(ctx, it.text ?? '', w - 28).forEach((l, i) => ctx.fillText(l, 14, 12 + i * fs * 1.15))
        break
      }
      case 'palette': {
        const colors = it.colors?.length ? it.colors : ['#eee']
        ctx.fillStyle = '#fffdf9'
        roundRect(ctx, 0, 0, w, h, 14)
        ctx.fill()
        const cw = w / colors.length
        colors.forEach((col, i) => {
          ctx.fillStyle = col
          roundRect(ctx, i * cw + 6, 6, cw - 12 + (i === colors.length - 1 ? 0 : 6), h - 40, 8)
          ctx.fill()
          ctx.fillStyle = '#958b80'
          ctx.font = `12px ${FONTS.body}`
          ctx.textAlign = 'center'
          ctx.fillText(col.toUpperCase(), i * cw + cw / 2, h - 14)
          ctx.textAlign = 'left'
        })
        break
      }
      case 'link': {
        ctx.fillStyle = '#fffdf9'
        ctx.strokeStyle = '#e9e0d2'
        roundRect(ctx, 0, 0, w, h, 14)
        ctx.fill()
        ctx.stroke()
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#2e2a26'
        ctx.font = `600 14px ${FONTS.body}`
        ctx.fillText(it.label || 'Lien', 16, 14, w - 32)
        ctx.fillStyle = '#a8676a'
        ctx.font = `12px ${FONTS.body}`
        ctx.fillText(it.url ?? '', 16, 36, w - 32)
        break
      }
      case 'swatch': {
        ctx.fillStyle = '#fffdf9'
        roundRect(ctx, 0, 0, w, h, 10)
        ctx.fill()
        const img = await loadImage(it.imageId)
        ctx.save()
        roundRect(ctx, 8, 8, w - 16, h - 40, 6)
        ctx.clip()
        if (img) drawCover(ctx, img, 8, 8, w - 16, h - 40)
        else {
          ctx.fillStyle = it.fill ?? '#d8c3a5'
          ctx.fillRect(8, 8, w - 16, h - 40)
        }
        ctx.restore()
        ctx.fillStyle = '#5b534b'
        ctx.font = `13px ${FONTS.body}`
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(it.label || 'Matière', 12, h - 13)
        break
      }
    }
    ctx.restore()
  }
  return c
}

const safeName = (s: string) => s.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'moodboard'

export async function exportBoardPNG(title: string, background: string, items: MoodItem[]) {
  const c = await renderBoard(background, items, 2)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('export')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${safeName(title)}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

/** PDF : ouvre une page d'impression avec le rendu, à enregistrer en PDF. */
export async function printBoard(title: string, background: string, items: MoodItem[]) {
  const c = await renderBoard(background, items, 2)
  const url = c.toDataURL('image/jpeg', 0.92)
  const landscape = c.width >= c.height
  const w = window.open('', '_blank')
  if (!w) throw new Error('popup')
  w.document.write(`<!doctype html><html><head><title>${safeName(title)}</title><style>
    @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
    html,body { margin:0; height:100%; }
    body { display:flex; flex-direction:column; align-items:center; justify-content:center; font-family: Georgia, serif; }
    img { max-width:100%; max-height:92vh; object-fit:contain; }
    h1 { font-weight:400; font-size:16pt; margin:0 0 4mm; color:#2e2a26; }
  </style></head><body>${title ? `<h1>${title.replace(/</g, '&lt;')}</h1>` : ''}<img src="${url}" onload="setTimeout(()=>print(),200)"></body></html>`)
  w.document.close()
}
