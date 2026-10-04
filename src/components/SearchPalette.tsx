import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ENTITY, listLinkable, type EntitySummary } from '../db/entities'
import { Icon } from './Icon'
import './search.css'

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Recherche globale (Ctrl+K) dans tous les contenus. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState<EntitySummary[]>([])
  const [sel, setSel] = useState(0)
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setSel(0)
    listLinkable().then(setAll)
    window.setTimeout(() => input.current?.focus(), 30)
  }, [open])

  const results = useMemo(() => {
    const n = normalize(q.trim())
    const list = n
      ? all.filter((e) => normalize(e.title).includes(n) || normalize(e.sub ?? '').includes(n))
      : [...all].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return list.slice(0, 40)
  }, [q, all])

  if (!open) return null

  const go = (e: EntitySummary) => {
    onClose()
    navigate(ENTITY[e.type].route(e.id))
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ alignItems: 'start', paddingTop: '12vh' }}>
      <div className="search-box">
        <div className="search-input-row">
          <Icon name="search" size={18} />
          <input
            ref={input}
            value={q}
            placeholder="Chercher une note, une envie, un projet…"
            onChange={(e) => {
              setQ(e.target.value)
              setSel(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(s + 1, results.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(s - 1, 0))
              }
              if (e.key === 'Enter' && results[sel]) go(results[sel])
            }}
          />
        </div>
        <div className="search-results">
          {results.length === 0 && <div className="empty">Rien trouvé pour « {q} ».</div>}
          {!q && results.length > 0 && <div className="eyebrow" style={{ padding: '8px 14px' }}>Récemment modifiés</div>}
          {results.map((r, i) => (
            <button key={r.type + r.id} className={`search-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
              <Icon name={ENTITY[r.type].icon} size={17} />
              <div className="search-item-text">
                <div className="search-item-title">{r.title}</div>
                {r.sub && <div className="search-item-sub">{r.sub}</div>}
              </div>
              <span className="chip neutral">{ENTITY[r.type].label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
