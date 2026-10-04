import { addDays, addMonths, parseLocal, ymd, ymdhm } from '../../lib/dates'
import type { CalendarEvent } from '../../db/types'

export interface Occurrence {
  event: CalendarEvent
  start: Date
  end: Date
  key: string // id + date de l'occurrence
  date: string // AAAA-MM-JJ de l'occurrence
}

/** Développe les événements (y compris récurrents) sur l'intervalle [from, to[. */
export function occurrences(events: CalendarEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of events) {
    if (ev.trashedAt) continue
    const s0 = parseLocal(ev.start)
    const e0 = parseLocal(ev.end)
    const dur = Math.max(0, e0.getTime() - s0.getTime())
    const push = (s: Date) => {
      const e = new Date(s.getTime() + dur)
      const d = ymd(s)
      if (ev.exceptions?.includes(d)) return
      if (e >= from && s < to) out.push({ event: ev, start: s, end: e, key: `${ev.id}:${d}`, date: d })
    }
    if (ev.recurrence === 'none') {
      push(s0)
      continue
    }
    let cur = new Date(s0)
    let i = 0
    // avance rapide pour les récurrences anciennes
    while (cur < from && i < 5000) {
      const next = step(cur, ev.recurrence, s0, i + 1)
      if (next.getTime() + dur >= from.getTime()) break
      cur = next
      i++
    }
    let guard = 0
    while (cur < to && guard < 800) {
      push(cur)
      i++
      cur = step(s0, ev.recurrence, s0, i)
      guard++
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function step(_cur: Date, rec: CalendarEvent['recurrence'], origin: Date, i: number): Date {
  switch (rec) {
    case 'daily':
      return addDays(origin, i)
    case 'weekly':
      return addDays(origin, i * 7)
    case 'monthly':
      return addMonths(origin, i)
    case 'yearly':
      return addMonths(origin, i * 12)
    default:
      return addDays(origin, 100000)
  }
}

export const RECURRENCE_LABEL: Record<CalendarEvent['recurrence'], string> = {
  none: 'Ne se répète pas',
  daily: 'Chaque jour',
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
  yearly: 'Chaque année',
}

/** Déplace une occurrence : pour un événement simple on le décale, pour une récurrence on décale toute la série. */
export function shiftEvent(ev: CalendarEvent, deltaMs: number): Pick<CalendarEvent, 'start' | 'end'> {
  return {
    start: ymdhm(new Date(parseLocal(ev.start).getTime() + deltaMs)),
    end: ymdhm(new Date(parseLocal(ev.end).getTime() + deltaMs)),
  }
}
