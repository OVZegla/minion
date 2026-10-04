import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { useAssetUrl } from '../../db/assets'
import type { JournalEntry } from '../../db/types'
import { Icon } from '../../components/Icon'
import { WEEKDAYS, addMonths, capitalize, fmtFullDate, fmtMonth, parseYmd, sameDay, startOfWeek, addDays, ymd } from '../../lib/dates'
import { moodOf } from './meta'
import './journal.css'

export async function openJournalDay(date: string, navigate: (to: string) => void) {
  const existing = await db.journal.where('date').equals(date).first()
  if (existing) return navigate(`/journal/${existing.id}`)
  const e: JournalEntry = { ...base(), date, content: null, text: '', highlights: [], prides: [], answers: {}, photoIds: [], mood: null }
  await db.journal.add(e)
  navigate(`/journal/${e.id}`)
}

/** Une page vide (aucun contenu) n'est pas affichée dans la chronologie. */
const isEmpty = (e: JournalEntry) => !e.text.trim() && !e.mood && !e.highlights.length && !e.prides.length && !e.photoIds.length && !Object.values(e.answers).some((a) => a.trim())

export function JournalPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<'chrono' | 'calendar'>('chrono')
  const entries = (useLiveQuery(() => db.journal.orderBy('date').reverse().toArray(), []) ?? []).filter((e) => !isEmpty(e))
  const today = ymd()

  return (
    <div className="page narrow journal-page">
      <div className="page-head">
        <div>
          <h1>Journal</h1>
          <p className="sub row" style={{ gap: 6 }}>
            <Icon name="lock" size={14} /> Privé. Rien n’est partagé.
          </p>
        </div>
        <span className="spacer" />
        <div className="seg">
          <button className={view === 'chrono' ? 'on' : ''} onClick={() => setView('chrono')}>
            Chronologie
          </button>
          <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>
            Calendrier
          </button>
        </div>
        <button className="btn primary" onClick={() => openJournalDay(today, navigate)}>
          <Icon name="feather" size={16} /> Aujourd’hui
        </button>
      </div>

      {view === 'calendar' ? (
        <JournalCalendar entries={entries} onDay={(d) => openJournalDay(d, navigate)} />
      ) : entries.length === 0 ? (
        <div className="empty">
          <span className="hand">Ton carnet t’attend</span>
          Une phrase suffit. Ou une photo. Ou juste une humeur.
        </div>
      ) : (
        <div className="journal-timeline">
          {entries.map((e, i) => {
            const prevMonth = i > 0 ? entries[i - 1].date.slice(0, 7) : null
            return (
              <div key={e.id}>
                {e.date.slice(0, 7) !== prevMonth && <div className="journal-month hand">{capitalize(fmtMonth(parseYmd(e.date)))}</div>}
                <EntryCard e={e} onOpen={() => navigate(`/journal/${e.id}`)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EntryCard({ e, onOpen }: { e: JournalEntry; onOpen: () => void }) {
  const mood = moodOf(e.mood)
  const photo = useAssetUrl(e.photoIds[0])
  const d = parseYmd(e.date)
  return (
    <article className="card hoverable journal-card" onClick={onOpen}>
      <div className="journal-card-date">
        <span className="d">{d.getDate()}</span>
        <span className="w">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
      </div>
      <div className="journal-card-body">
        <div className="row" style={{ gap: 8 }}>
          {e.title && <h3>{e.title}</h3>}
          {mood && (
            <span className="chip neutral">
              {mood.emoji} {mood.label}
            </span>
          )}
        </div>
        {e.text && <p className="journal-excerpt">{e.text.slice(0, 260)}</p>}
        {(e.highlights.length > 0 || e.prides.length > 0) && (
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {e.highlights.slice(0, 3).map((h, i) => (
              <span key={'h' + i} className="chip">
                ✦ {h}
              </span>
            ))}
            {e.prides.slice(0, 2).map((p, i) => (
              <span key={'p' + i} className="chip" style={{ background: 'color-mix(in srgb, var(--gold) 16%, transparent)', color: '#8a6a2e' }}>
                ★ {p}
              </span>
            ))}
          </div>
        )}
      </div>
      {photo && <img className="journal-card-photo" src={photo} alt="" />}
    </article>
  )
}

function JournalCalendar({ entries, onDay }: { entries: JournalEntry[]; onDay: (d: string) => void }) {
  const [cursor, setCursor] = useState(() => new Date())
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = startOfWeek(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const today = new Date()
  return (
    <div className="card pad">
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn ghost icon sm" aria-label="Mois précédent" onClick={() => setCursor((c) => addMonths(c, -1))}>
          <Icon name="chevronLeft" />
        </button>
        <h3 style={{ flex: 1, textAlign: 'center' }}>{capitalize(fmtMonth(cursor))}</h3>
        <button className="btn ghost icon sm" aria-label="Mois suivant" onClick={() => setCursor((c) => addMonths(c, 1))}>
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="jcal">
        {WEEKDAYS.map((w) => (
          <div key={w} className="month-wd" style={{ border: 'none', textAlign: 'center' }}>
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = ymd(d)
          const e = byDate.get(key)
          const future = d > today && !sameDay(d, today)
          return (
            <button
              key={key}
              className={`jcal-day ${d.getMonth() !== cursor.getMonth() ? 'other' : ''} ${e ? 'has' : ''} ${sameDay(d, today) ? 'today' : ''}`}
              disabled={future}
              onClick={() => onDay(key)}
              title={capitalize(fmtFullDate(d))}
            >
              <span>{d.getDate()}</span>
              {e && <span className="jcal-mark">{moodOf(e.mood)?.emoji ?? '•'}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
