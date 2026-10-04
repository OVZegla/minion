import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { CalendarEvent } from '../../db/types'
import { Icon } from '../../components/Icon'
import { TaskList } from '../../components/TaskList'
import {
  WEEKDAYS,
  addDays,
  addMonths,
  capitalize,
  fmtFullDate,
  fmtMonth,
  fmtTime,
  parseLocal,
  sameDay,
  startOfWeek,
  ymd,
  ymdhm,
} from '../../lib/dates'
import { occurrences, shiftEvent, type Occurrence } from './api'
import { EventModal, type EventDraftSeed } from './EventModal'
import './calendar.css'

type View = 'day' | 'week' | 'month'
const HOUR_H = 52 // px par heure
const SNAP = 15 // minutes

export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(() => (window.innerWidth < 760 ? 'day' : ((localStorage.getItem('minion:calView') as View) ?? 'week')))
  const [cursor, setCursor] = useState(() => new Date())
  const [seed, setSeed] = useState<EventDraftSeed | null>(null)
  const [openOcc, setOpenOcc] = useState<{ id: string; date?: string } | null>(null)
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []

  // ouverture depuis un lien (?evt=id)
  useEffect(() => {
    const id = params.get('evt')
    if (id) {
      setOpenOcc({ id })
      const ev = events.find((e) => e.id === id)
      if (ev) setCursor(parseLocal(ev.start))
    }
  }, [params.get('evt'), events.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const setV = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('minion:calView', v)
    } catch {
      /* rien */
    }
  }

  const range = useMemo(() => {
    if (view === 'day') {
      const s = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
      return { from: s, to: addDays(s, 1), days: [s] }
    }
    if (view === 'week') {
      const s = startOfWeek(cursor)
      return { from: s, to: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) }
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const s = startOfWeek(first)
    return { from: s, to: addDays(s, 42), days: Array.from({ length: 42 }, (_, i) => addDays(s, i)) }
  }, [view, cursor])

  const occ = useMemo(() => occurrences(events, range.from, range.to), [events, range])

  const move = (dir: -1 | 1) => setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : addMonths(c, dir)))

  const title =
    view === 'month'
      ? capitalize(fmtMonth(cursor))
      : view === 'day'
        ? capitalize(fmtFullDate(cursor))
        : (() => {
            const s = range.days[0]
            const e = range.days[6]
            return s.getMonth() === e.getMonth() ? `${s.getDate()} – ${e.getDate()} ${fmtMonth(e)}` : `${s.getDate()} ${fmtMonth(s).split(' ')[0]} – ${e.getDate()} ${fmtMonth(e)}`
          })()

  const opened = openOcc ? events.find((e) => e.id === openOcc.id) : null

  return (
    <div className="page wide cal-page">
      <div className="cal-head">
        <h1>{title}</h1>
        <span className="spacer" />
        <div className="row" style={{ gap: 4 }}>
          <button className="btn ghost icon sm" aria-label="Précédent" onClick={() => move(-1)}>
            <Icon name="chevronLeft" />
          </button>
          <button className="btn sm" onClick={() => setCursor(new Date())}>
            Aujourd’hui
          </button>
          <button className="btn ghost icon sm" aria-label="Suivant" onClick={() => move(1)}>
            <Icon name="chevronRight" />
          </button>
        </div>
        <div className="seg">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setV(v)}>
              {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>
        <button
          className="btn primary"
          onClick={() => {
            const s = new Date(cursor)
            s.setHours(Math.max(9, new Date().getHours() + 1), 0, 0, 0)
            setSeed({ start: s })
          }}
        >
          <Icon name="plus" size={16} /> Événement
        </button>
      </div>

      <div className="cal-layout">
        <div className="cal-main card">
          {view === 'month' ? (
            <MonthGrid
              days={range.days}
              month={cursor.getMonth()}
              occ={occ}
              onDay={(d) => {
                setCursor(d)
                setV('day')
              }}
              onNew={(d) => {
                const s = new Date(d)
                s.setHours(10, 0, 0, 0)
                setSeed({ start: s })
              }}
              onOpen={(o) => setOpenOcc({ id: o.event.id, date: o.date })}
              events={events}
            />
          ) : (
            <TimeGrid days={range.days} occ={occ} onOpen={(o) => setOpenOcc({ id: o.event.id, date: o.date })} onNew={(s, e, allDay) => setSeed({ start: s, end: e, allDay })} />
          )}
        </div>

        <aside className="cal-side">
          <div className="card pad">
            <h3 style={{ marginBottom: 10 }}>Aujourd’hui</h3>
            <TaskList filter={(t) => t.date === ymd()} showDone={false} defaultDate={ymd()} placeholder="Une chose pour aujourd’hui…" />
          </div>
          <div className="card pad">
            <h3 style={{ marginBottom: 4 }}>Tâches sans date</h3>
            <p className="faint" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
              Quand tu veux, sans pression.
            </p>
            <TaskList filter={(t) => !t.date && !t.projectId} />
          </div>
          <OverdueTasks />
        </aside>
      </div>

      {seed && <EventModal seed={seed} onClose={() => setSeed(null)} />}
      {opened && (
        <EventModal
          event={opened}
          occurrenceDate={openOcc?.date}
          onClose={() => {
            setOpenOcc(null)
            if (params.get('evt')) setParams({})
          }}
        />
      )}
    </div>
  )
}

/** Tâches dont la date est passée : proposées doucement, à reporter ou à laisser filer. */
function OverdueTasks() {
  const count = useLiveQuery(() => db.tasks.filter((t) => !t.done && !t.trashedAt && !!t.date && t.date < ymd()).count(), []) ?? 0
  if (!count) return null
  return (
    <div className="card pad">
      <h3 style={{ marginBottom: 4 }}>Restées en chemin</h3>
      <p className="faint" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
        Reporte-les, retire leur date, ou laisse-les partir.
      </p>
      <TaskList filter={(t) => !!t.date && t.date < ymd()} showDone={false} placeholder="" />
    </div>
  )
}

/* ---------------- Vue mois ---------------- */

function MonthGrid({
  days,
  month,
  occ,
  onDay,
  onNew,
  onOpen,
  events,
}: {
  days: Date[]
  month: number
  occ: Occurrence[]
  onDay: (d: Date) => void
  onNew: (d: Date) => void
  onOpen: (o: Occurrence) => void
  events: CalendarEvent[]
}) {
  const today = new Date()
  const [over, setOver] = useState<string | null>(null)
  const drop = async (day: Date, evId: string, fromDate: string) => {
    setOver(null)
    const ev = events.find((e) => e.id === evId)
    if (!ev) return
    const delta = new Date(day).setHours(0, 0, 0, 0) - new Date(parseLocal(fromDate)).setHours(0, 0, 0, 0)
    if (delta) await db.events.update(ev.id, { ...shiftEvent(ev, delta), updatedAt: Date.now() })
  }
  return (
    <div className="month">
      {WEEKDAYS.map((w) => (
        <div key={w} className="month-wd">
          {w}
        </div>
      ))}
      {days.map((d) => {
        const key = ymd(d)
        const items = occ.filter((o) => o.date === key)
        return (
          <div
            key={key}
            className={`month-cell ${d.getMonth() !== month ? 'other' : ''} ${sameDay(d, today) ? 'today' : ''} ${over === key ? 'over' : ''}`}
            onDoubleClick={() => onNew(d)}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(key)
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              const [id, from] = e.dataTransfer.getData('text/event').split('|')
              if (id) drop(d, id, from)
            }}
          >
            <button className="month-num" onClick={() => onDay(d)}>
              {d.getDate()}
            </button>
            <div className="month-items">
              {items.slice(0, 3).map((o) => (
                <button
                  key={o.key}
                  className="month-ev"
                  style={{ ['--c' as string]: o.event.color }}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/event', `${o.event.id}|${o.date}`)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(o)
                  }}
                >
                  {!o.event.allDay && <span className="t">{fmtTime(o.start)}</span>}
                  {o.event.title}
                </button>
              ))}
              {items.length > 3 && (
                <button className="month-more" onClick={() => onDay(d)}>
                  +{items.length - 3}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Vues jour / semaine ---------------- */

function TimeGrid({ days, occ, onOpen, onNew }: { days: Date[]; occ: Occurrence[]; onOpen: (o: Occurrence) => void; onNew: (s: Date, e: Date, allDay?: boolean) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ occ: Occurrence; mode: 'move' | 'resize'; startX: number; startY: number; dMin: number; dDay: number; moved: boolean } | null>(null)
  const today = new Date()
  const [nowMin, setNowMin] = useState(() => today.getHours() * 60 + today.getMinutes())

  useEffect(() => {
    scroller.current?.scrollTo({ top: HOUR_H * 7.5 })
    const t = window.setInterval(() => {
      const n = new Date()
      setNowMin(n.getHours() * 60 + n.getMinutes())
    }, 60000)
    return () => window.clearInterval(t)
  }, [])

  const colWidth = () => (colsRef.current ? colsRef.current.clientWidth / days.length : 100)

  const onPointerDown = (e: RPointerEvent, o: Occurrence, mode: 'move' | 'resize') => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ occ: o, mode, startX: e.clientX, startY: e.clientY, dMin: 0, dDay: 0, moved: false })
  }
  const onPointerMove = (e: RPointerEvent) => {
    if (!drag) return
    const dy = e.clientY - drag.startY
    const dx = e.clientX - drag.startX
    const dMin = Math.round(((dy / HOUR_H) * 60) / SNAP) * SNAP
    const dDay = drag.mode === 'move' ? Math.round(dx / colWidth()) : 0
    const moved = drag.moved || Math.abs(dy) > 4 || Math.abs(dx) > 4
    if (dMin !== drag.dMin || dDay !== drag.dDay || moved !== drag.moved) setDrag({ ...drag, dMin, dDay, moved })
  }
  const onPointerUp = async () => {
    if (!drag) return
    const { occ: o, mode, dMin, dDay, moved } = drag
    setDrag(null)
    if (!moved) return onOpen(o)
    const ev = o.event
    if (mode === 'move') {
      const delta = dMin * 60000 + dDay * 86400000
      if (delta) await db.events.update(ev.id, { ...shiftEvent(ev, delta), updatedAt: Date.now() })
    } else {
      const end = new Date(parseLocal(ev.end).getTime() + dMin * 60000)
      const minEnd = new Date(parseLocal(ev.start).getTime() + SNAP * 60000)
      await db.events.update(ev.id, { end: ymdhm(end < minEnd ? minEnd : end), updatedAt: Date.now() })
    }
  }

  const createAt = (e: React.MouseEvent, day: Date) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const min = Math.floor((((e.clientY - rect.top) / HOUR_H) * 60) / 30) * 30
    const s = new Date(day)
    s.setHours(0, min, 0, 0)
    onNew(s, new Date(s.getTime() + 60 * 60000))
  }

  const allDay = occ.filter((o) => o.event.allDay)

  return (
    <div className={`tg ${days.length === 1 ? 'single' : ''}`}>
      <div className="tg-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => (
          <div key={+d} className={`tg-day ${sameDay(d, today) ? 'today' : ''}`}>
            <span className="tg-wd">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
            <span className="tg-num">{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="tg-allday" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div className="tg-allday-label">journée</div>
        {days.map((d) => (
          <div
            key={+d}
            className="tg-allday-cell"
            onDoubleClick={() => {
              const s = new Date(d)
              s.setHours(0, 0, 0, 0)
              onNew(s, addDays(s, 1), true)
            }}
          >
            {allDay
              .filter((o) => o.date === ymd(d))
              .map((o) => (
                <button key={o.key} className="month-ev" style={{ ['--c' as string]: o.event.color }} onClick={() => onOpen(o)}>
                  {o.event.title}
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ gridTemplateColumns: `56px 1fr`, height: HOUR_H * 24 }}>
          <div className="tg-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="tg-hour" style={{ top: h * HOUR_H }}>
                {h > 0 && `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
          <div className="tg-cols" ref={colsRef} style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            {days.map((d, di) => {
              const items = occ.filter((o) => !o.event.allDay && o.date === ymd(d))
              const lanes = layoutLanes(items)
              return (
                <div key={+d} className="tg-col" onDoubleClick={(e) => createAt(e, d)}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="tg-line" style={{ top: h * HOUR_H }} />
                  ))}
                  {sameDay(d, today) && <div className="tg-now" style={{ top: (nowMin / 60) * HOUR_H }} />}
                  {items.map((o) => {
                    const startMin = o.start.getHours() * 60 + o.start.getMinutes()
                    let dur = Math.max(SNAP, (o.end.getTime() - o.start.getTime()) / 60000)
                    let top = (startMin / 60) * HOUR_H
                    let leftShift = 0
                    const isDragging = drag?.occ.key === o.key && drag.moved
                    if (isDragging) {
                      if (drag.mode === 'move') {
                        top += (drag.dMin / 60) * HOUR_H
                        leftShift = drag.dDay
                      } else dur = Math.max(SNAP, dur + drag.dMin)
                    }
                    const lane = lanes.get(o.key)!
                    const height = (dur / 60) * HOUR_H
                    return (
                      <div
                        key={o.key}
                        className={`tg-ev ${isDragging ? 'dragging' : ''}`}
                        style={{
                          ['--c' as string]: o.event.color,
                          top,
                          height: Math.max(height - 2, 18),
                          left: `${(lane.i / lane.n) * 100}%`,
                          width: `calc(${100 / lane.n}% - 4px)`,
                          transform: leftShift ? `translateX(${leftShift * colWidth()}px)` : undefined,
                        }}
                        onPointerDown={(e) => onPointerDown(e, o, 'move')}
                        onDoubleClick={(e) => e.stopPropagation()}
                        data-col={di}
                      >
                        <div className="tg-ev-title">{o.event.title}</div>
                        {height > 34 && (
                          <div className="tg-ev-time">
                            {fmtTime(isDragging && drag.mode === 'move' ? new Date(o.start.getTime() + drag.dMin * 60000) : o.start)} –{' '}
                            {fmtTime(new Date((isDragging && drag.mode === 'move' ? o.start.getTime() + drag.dMin * 60000 : o.start.getTime()) + dur * 60000))}
                          </div>
                        )}
                        <div className="tg-ev-resize" onPointerDown={(e) => onPointerDown(e, o, 'resize')} />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="faint tg-hint">Double-clique pour ajouter · glisse pour déplacer · tire le bas pour allonger</p>
    </div>
  )
}

/** Répartit les événements qui se chevauchent en colonnes. */
function layoutLanes(items: Occurrence[]) {
  const out = new Map<string, { i: number; n: number }>()
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime())
  let group: Occurrence[] = []
  let groupEnd = 0
  const flush = () => {
    const lanes: number[] = []
    const assign = new Map<string, number>()
    for (const o of group) {
      let i = lanes.findIndex((end) => end <= o.start.getTime())
      if (i < 0) {
        i = lanes.length
        lanes.push(0)
      }
      lanes[i] = o.end.getTime()
      assign.set(o.key, i)
    }
    group.forEach((o) => out.set(o.key, { i: assign.get(o.key)!, n: lanes.length }))
    group = []
  }
  for (const o of sorted) {
    if (group.length && o.start.getTime() >= groupEnd) flush()
    group.push(o)
    groupEnd = Math.max(groupEnd, o.end.getTime())
  }
  flush()
  return out
}
