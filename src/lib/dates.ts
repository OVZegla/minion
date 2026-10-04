/** Utilitaires de dates (heure locale, format français). */

export const pad = (n: number) => String(n).padStart(2, '0')

/** AAAA-MM-JJ en heure locale */
export function ymd(d: Date = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** AAAA-MM-JJTHH:mm en heure locale */
export function ymdhm(d: Date) {
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function parseYmd(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function parseLocal(s: string) {
  const [date, time = '00:00'] = s.split('T')
  const d = parseYmd(date)
  const [h, mi] = time.split(':').map(Number)
  d.setHours(h || 0, mi || 0, 0, 0)
  return d
}

export function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function addMonths(d: Date, n: number) {
  const r = new Date(d)
  const day = r.getDate()
  r.setDate(1)
  r.setMonth(r.getMonth() + n)
  r.setDate(Math.min(day, daysInMonth(r)))
  return r
}

export function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** Lundi de la semaine */
export function startOfWeek(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const wd = (r.getDay() + 6) % 7
  return addDays(r, -wd)
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', o)

export const fmtLongDate = (d: Date) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d)
export const fmtFullDate = (d: Date) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
export const fmtDay = (d: Date) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(d)
export const fmtShortDay = (d: Date) => fmt({ day: 'numeric', month: 'short' }).format(d)
export const fmtMonth = (d: Date) => fmt({ month: 'long', year: 'numeric' }).format(d)
export const fmtTime = (d: Date) => fmt({ hour: '2-digit', minute: '2-digit' }).format(d)
export const fmtWeekdayShort = (d: Date) => fmt({ weekday: 'short' }).format(d)

export const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']

/** « il y a 3 min », « hier »… */
export function relative(ts: number) {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'hier'
  if (d < 7) return `il y a ${d} jours`
  return fmtShortDay(new Date(ts))
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
