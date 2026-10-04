import { useEffect } from 'react'
import { db } from '../../db/db'
import { addDays, fmtTime } from '../../lib/dates'
import { occurrences } from './api'

const FIRED_KEY = 'minion:firedReminders'

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}
function saveFired(s: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-300)))
  } catch {
    /* rien */
  }
}

/**
 * Vérifie toutes les 30 s les rappels à venir.
 * Notification système si autorisée, sinon message dans l'app.
 * (Fonctionne pendant que Minion est ouvert.)
 */
export function useReminders(toast: (text: string) => void) {
  useEffect(() => {
    const check = async () => {
      const now = new Date()
      const events = (await db.events.toArray()).filter((e) => e.reminders?.length)
      if (!events.length) return
      const fired = loadFired()
      const occ = occurrences(events, addDays(now, -1), addDays(now, 2))
      for (const o of occ) {
        for (const r of o.event.reminders) {
          const at = o.start.getTime() - r * 60000
          const key = `${o.key}:${r}`
          // dans la fenêtre : de l'heure du rappel jusqu'à 10 min après
          if (now.getTime() >= at && now.getTime() - at < 10 * 60000 && !fired.has(key)) {
            fired.add(key)
            const when = r === 0 ? 'maintenant' : o.event.allDay ? 'demain' : `à ${fmtTime(o.start)}`
            const text = `${o.event.title} · ${when}`
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Minion', { body: text, icon: './icons/icon-192.png', tag: key })
              } catch {
                toast(`⏰ ${text}`)
              }
            } else toast(`⏰ ${text}`)
          }
        }
      }
      saveFired(fired)
    }
    check()
    const t = window.setInterval(check, 30000)
    return () => window.clearInterval(t)
  }, [toast])
}
