import { useEffect, useState } from 'react'
import { base, db } from '../../db/db'
import { removeAllLinks } from '../../db/links'
import { useSettings } from '../../db/settings'
import type { CalendarEvent } from '../../db/types'
import { Icon } from '../../components/Icon'
import { LinkedItems } from '../../components/Linked'
import { Modal, useUI } from '../../components/ui'
import { addDays, parseLocal, ymd, ymdhm } from '../../lib/dates'
import { RECURRENCE_LABEL } from './api'

const REMINDERS = [
  { v: 0, l: 'Au moment' },
  { v: 10, l: '10 min avant' },
  { v: 30, l: '30 min avant' },
  { v: 60, l: '1 h avant' },
  { v: 1440, l: 'La veille' },
]

export interface EventDraftSeed {
  start: Date
  end?: Date
  allDay?: boolean
}

/** Création / édition d'un événement. `occurrenceDate` = date de l'occurrence cliquée (récurrences). */
export function EventModal({
  event,
  seed,
  occurrenceDate,
  onClose,
}: {
  event?: CalendarEvent | null
  seed?: EventDraftSeed | null
  occurrenceDate?: string
  onClose: () => void
}) {
  const settings = useSettings()
  const { confirm, toast } = useUI()
  const kinds = settings.eventKinds
  const [d, setD] = useState<CalendarEvent>(() => event ?? fresh(seed!, kinds[0]))
  useEffect(() => setD(event ?? fresh(seed!, kinds[0])), [event?.id, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const isNew = !event
  const set = (p: Partial<CalendarEvent>) => setD((x) => ({ ...x, ...p }))

  const date = d.start.slice(0, 10)
  const startTime = d.start.slice(11, 16)
  const endTime = d.end.slice(11, 16)
  const setDate = (v: string) => {
    if (!v) return
    const dur = parseLocal(d.end).getTime() - parseLocal(d.start).getTime()
    const s = parseLocal(`${v}T${startTime}`)
    set({ start: ymdhm(s), end: ymdhm(new Date(s.getTime() + dur)) })
  }
  const setTimes = (st: string, en: string) => {
    let e = parseLocal(`${date}T${en}`)
    const s = parseLocal(`${date}T${st}`)
    if (e <= s) e = new Date(s.getTime() + 60 * 60000)
    set({ start: ymdhm(s), end: ymdhm(e) })
  }

  const save = async () => {
    const v = { ...d, title: d.title.trim() || 'Sans titre', updatedAt: Date.now() }
    await db.events.put(v)
    if (v.reminders.length && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    onClose()
  }

  const remove = async () => {
    if (d.recurrence !== 'none' && occurrenceDate) {
      const choice = await confirm({ title: 'Retirer cet événement ?', message: 'Il se répète. Veux-tu retirer toute la série ? (Pour ne retirer que ce jour-là, utilise « Retirer cette fois ».)', confirmLabel: 'Retirer toute la série', danger: true })
      if (!choice) return
    } else if (!(await confirm({ title: 'Retirer cet événement ?', confirmLabel: 'Retirer', danger: true }))) return
    await db.events.delete(d.id)
    await removeAllLinks('event', d.id)
    onClose()
  }

  const skipOnce = async () => {
    if (!occurrenceDate) return
    await db.events.update(d.id, { exceptions: [...(d.exceptions ?? []), occurrenceDate], updatedAt: Date.now() })
    toast('Retiré pour cette fois')
    onClose()
  }

  const postpone = async () => {
    // une activité non réalisée : on la décale d'un jour, sans culpabiliser
    if (d.recurrence !== 'none' && occurrenceDate) {
      const s = parseLocal(`${occurrenceDate}T${startTime}`)
      const dur = parseLocal(d.end).getTime() - parseLocal(d.start).getTime()
      const ns = addDays(s, 1)
      await db.events.update(d.id, { exceptions: [...(d.exceptions ?? []), occurrenceDate] })
      await db.events.add({ ...d, ...base(), recurrence: 'none', exceptions: [], start: ymdhm(ns), end: ymdhm(new Date(ns.getTime() + dur)) })
    } else {
      const s = addDays(parseLocal(d.start), 1)
      const e = addDays(parseLocal(d.end), 1)
      await db.events.update(d.id, { start: ymdhm(s), end: ymdhm(e), updatedAt: Date.now() })
    }
    toast('Reporté à demain')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={600}
      title={isNew ? 'Nouvel événement' : 'Événement'}
      footer={
        <>
          {!isNew && (
            <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={remove}>
              <Icon name="trash" size={15} /> Retirer
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <input className="title-input" style={{ fontSize: '1.6rem', marginBottom: 14 }} placeholder="Titre" autoFocus={isNew} value={d.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />

      <div className="row wrap" style={{ gap: 6, marginBottom: 16 }}>
        {kinds.map((k) => (
          <button key={k.id} className={`chip ${d.kind === k.id ? 'active' : 'neutral'}`} style={d.kind === k.id ? { background: k.color } : undefined} onClick={() => set({ kind: k.id, color: k.color })}>
            {k.name}
          </button>
        ))}
      </div>

      <div className="ev-grid">
        <label>
          <span className="label">Date</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {!d.allDay && (
          <>
            <label>
              <span className="label">Début</span>
              <input type="time" className="input" value={startTime} onChange={(e) => setTimes(e.target.value, endTime)} />
            </label>
            <label>
              <span className="label">Fin</span>
              <input type="time" className="input" value={endTime} onChange={(e) => setTimes(startTime, e.target.value)} />
            </label>
          </>
        )}
      </div>
      <label className="row" style={{ margin: '10px 0 16px', cursor: 'pointer', fontSize: '0.9rem' }}>
        <input type="checkbox" checked={d.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> Toute la journée
      </label>

      <div className="ev-grid">
        <label>
          <span className="label">Répétition</span>
          <select className="select" value={d.recurrence} onChange={(e) => set({ recurrence: e.target.value as CalendarEvent['recurrence'] })}>
            {Object.entries(RECURRENCE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Couleur</span>
          <input type="color" className="input" style={{ height: 42, padding: 4 }} value={d.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
      </div>

      <span className="label" style={{ marginTop: 14 }}>
        Rappels
      </span>
      <div className="row wrap" style={{ gap: 6 }}>
        {REMINDERS.map((r) => {
          const on = d.reminders.includes(r.v)
          return (
            <button key={r.v} className={`chip ${on ? 'active' : 'neutral'}`} onClick={() => set({ reminders: on ? d.reminders.filter((x) => x !== r.v) : [...d.reminders, r.v] })}>
              <Icon name="bell" size={12} /> {r.l}
            </button>
          )
        })}
      </div>
      <p className="faint" style={{ fontSize: '0.76rem', marginTop: 6 }}>
        Les rappels s’affichent quand Minion est ouvert.
      </p>

      <textarea className="textarea" style={{ marginTop: 14, minHeight: 70 }} placeholder="Notes (facultatif)" value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />

      {!isNew && (
        <>
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn sm" onClick={postpone}>
              Reporter à demain
            </button>
            {d.recurrence !== 'none' && occurrenceDate && (
              <button className="btn sm" onClick={skipOnce}>
                Retirer cette fois
              </button>
            )}
          </div>
          <div style={{ marginTop: 18 }}>
            <LinkedItems type="event" id={d.id} title="Contenus associés" />
          </div>
        </>
      )}
    </Modal>
  )
}

function fresh(seed: EventDraftSeed, kind: { id: string; color: string }): CalendarEvent {
  const s = seed.start
  const e = seed.end ?? new Date(s.getTime() + 60 * 60000)
  return {
    ...base(),
    title: '',
    start: ymdhm(s),
    end: ymdhm(e),
    allDay: !!seed.allDay,
    color: kind.color,
    kind: kind.id,
    recurrence: 'none',
    reminders: [],
    exceptions: [],
  }
}

export const todayAt = (h: number) => {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d
}
export { ymd }
