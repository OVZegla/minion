import type { Card, Note } from '../../db/types'
import { uid } from '../../db/db'

/**
 * Propositions de cartes et de fiches à partir de ses notes.
 * Pas d'IA : uniquement des règles simples appliquées à SON texte.
 * Chaque proposition garde le passage source, et rien n'est inventé.
 */

interface Block {
  kind: 'heading' | 'para' | 'item' | 'quote'
  level?: number
  text: string
  bold: string[] // passages en gras
}

type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: { type: string }[] }

function textOf(n: PMNode): string {
  if (n.text) return n.text
  return (n.content ?? []).map(textOf).join('')
}
function boldOf(n: PMNode, acc: string[] = []): string[] {
  if (n.text && n.marks?.some((m) => m.type === 'bold')) acc.push(n.text.trim())
  ;(n.content ?? []).forEach((c) => boldOf(c, acc))
  return acc.filter(Boolean)
}

/** Aplatit le document TipTap (ou le texte brut) en blocs lisibles. */
export function blocksOf(note: Note): Block[] {
  const doc = note.content as PMNode | null
  if (!doc?.content) {
    return note.text
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ kind: 'para' as const, text: t, bold: [] }))
  }
  const out: Block[] = []
  const walk = (n: PMNode) => {
    switch (n.type) {
      case 'heading':
        out.push({ kind: 'heading', level: Number(n.attrs?.level ?? 1), text: textOf(n).trim(), bold: [] })
        return
      case 'paragraph': {
        const t = textOf(n).trim()
        if (t) out.push({ kind: 'para', text: t, bold: boldOf(n) })
        return
      }
      case 'listItem':
      case 'taskItem': {
        const t = textOf(n).trim()
        if (t) out.push({ kind: 'item', text: t, bold: boldOf(n) })
        return
      }
      case 'blockquote': {
        const t = textOf(n).trim()
        if (t) out.push({ kind: 'quote', text: t, bold: boldOf(n) })
        return
      }
      default:
        ;(n.content ?? []).forEach(walk)
    }
  }
  doc.content.forEach(walk)
  return out
}

const clip = (s: string, n = 320) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s)

export interface Proposal {
  q: string
  a: string
  source: string
  rule: string
}

/** Propose des cartes question / réponse. */
export function proposeCards(notes: Note[]): Proposal[] {
  const out: Proposal[] = []
  for (const note of notes) {
    const blocks = blocksOf(note)
    blocks.forEach((b, i) => {
      // 1. « Terme : définition » ou « Terme — définition »
      const def = b.text.match(/^([^:—–\n]{2,60})\s*[:—–]\s+(.{3,})$/)
      if ((b.kind === 'para' || b.kind === 'item') && def && !/^https?$/i.test(def[1].trim())) {
        out.push({ q: `Que signifie « ${def[1].trim()} » ?`, a: def[2].trim(), source: b.text, rule: 'Définition (terme : explication)' })
        return
      }
      // 2. Une ligne qui se termine par « ? » suivie de sa réponse
      if (b.text.endsWith('?') && blocks[i + 1] && blocks[i + 1].kind !== 'heading') {
        out.push({ q: b.text, a: clip(blocks[i + 1].text), source: `${b.text}\n${blocks[i + 1].text}`, rule: 'Question écrite dans la note' })
        return
      }
      // 3. Mots en gras : texte à trous
      if (b.bold.length && b.kind !== 'heading') {
        for (const w of b.bold.slice(0, 2)) {
          if (w.length < 2 || w.length > 60 || w === b.text) continue
          out.push({ q: b.text.replace(w, '_____'), a: w, source: b.text, rule: 'Mot en gras (texte à trous)' })
        }
      }
      // 4. Un titre suivi de son contenu
      if (b.kind === 'heading' && b.text) {
        const body: string[] = []
        for (let k = i + 1; k < blocks.length && blocks[k].kind !== 'heading'; k++) body.push(blocks[k].text)
        if (body.length) out.push({ q: `Que retenir sur « ${b.text} » ?`, a: clip(body.join(' · ')), source: [b.text, ...body].join('\n'), rule: 'Titre et son contenu' })
      }
    })
  }
  // sans doublon
  const seen = new Set<string>()
  return out.filter((p) => (seen.has(p.q) ? false : (seen.add(p.q), true)))
}

export function toCard(p: Proposal | { q: string; a: string }, auto: boolean): Card {
  return { id: uid(), q: p.q, a: p.a, source: 'source' in p ? p.source : null, auto, box: 0, dueAt: 0, seen: 0, right: 0 }
}

/** Ce qui manque pour pouvoir proposer quelque chose (signalé honnêtement). */
export function missingInfo(notes: Note[]): string[] {
  const out: string[] = []
  if (!notes.length) out.push('Aucune note n’est reliée à cette série.')
  for (const n of notes) {
    const words = n.text.trim().split(/\s+/).filter(Boolean)
    const links = (n.text.match(/https?:\/\/\S+/g) ?? []).length
    if (words.length < 12 && links) out.push(`« ${n.title || 'Sans titre'} » contient surtout un lien : Minion ne lit pas les vidéos ni les pages web. Ajoute ce que tu en retiens pour pouvoir réviser.`)
    else if (words.length < 12) out.push(`« ${n.title || 'Sans titre'} » est encore très courte : il y a peu de matière à transformer.`)
  }
  return out
}

/** Fiche synthétique : titres, phrases-clés et mots en gras, tirés de ses notes. */
export function proposeSummary(notes: Note[]) {
  const content: PMNode[] = []
  for (const note of notes) {
    const blocks = blocksOf(note)
    if (!blocks.length) continue
    content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: note.title || 'Sans titre' }] })
    const items: PMNode[] = []
    const keyTerms = new Set<string>()
    let lastHeading = ''
    for (const b of blocks) {
      b.bold.forEach((w) => keyTerms.add(w))
      if (b.kind === 'heading') {
        lastHeading = b.text
        continue
      }
      // première phrase de chaque paragraphe
      const first = b.text.split(/(?<=[.!?])\s/)[0]
      const line = lastHeading ? `${lastHeading} — ${clip(first, 180)}` : clip(first, 200)
      lastHeading = ''
      items.push({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: line }] }] })
    }
    if (items.length) content.push({ type: 'bulletList', content: items.slice(0, 14) })
    if (keyTerms.size)
      content.push({ type: 'paragraph', content: [{ type: 'text', text: 'Mots-clés : ', marks: [{ type: 'bold' }] }, { type: 'text', text: [...keyTerms].join(', ') }] })
  }
  const doc = { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
  const text = content.map(textOf).join('\n')
  return { content: doc, text }
}

/** Boîtes de Leitner : intervalle (jours) avant la prochaine révision. */
export const BOX_DAYS = [0, 1, 3, 7, 16]

export function review(card: Card, knew: boolean): Card {
  const box = knew ? Math.min(4, card.box + 1) : 0
  return { ...card, box, seen: card.seen + 1, right: card.right + (knew ? 1 : 0), dueAt: Date.now() + BOX_DAYS[box] * 86400000 - 60000 }
}

export function normalizeAnswer(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
