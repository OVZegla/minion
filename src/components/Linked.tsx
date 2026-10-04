import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ENTITY, LINKABLE, listLinkable, summarize, type EntitySummary } from '../db/entities'
import { link, unlink, useLinks } from '../db/links'
import type { EntityType } from '../db/types'
import { Icon } from './Icon'
import { Modal } from './ui'
import { normalize } from './SearchPalette'

/** Sélecteur de contenu à relier. */
export function LinkPicker({
  open,
  onClose,
  onPick,
  exclude = [],
  types = LINKABLE,
  title = 'Relier un contenu',
}: {
  open: boolean
  onClose: () => void
  onPick: (e: EntitySummary) => void
  exclude?: string[]
  types?: EntityType[]
  title?: string
}) {
  const [all, setAll] = useState<EntitySummary[]>([])
  const [q, setQ] = useState('')
  const [type, setType] = useState<EntityType | 'all'>('all')
  useEffect(() => {
    if (open) {
      setQ('')
      listLinkable().then(setAll)
    }
  }, [open])
  const list = useMemo(() => {
    const n = normalize(q)
    return all
      .filter((e) => types.includes(e.type) && !exclude.includes(e.id))
      .filter((e) => type === 'all' || e.type === type)
      .filter((e) => !n || normalize(e.title).includes(n))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 60)
  }, [all, q, type, exclude, types])

  return (
    <Modal open={open} onClose={onClose} title={title} width={560}>
      <input className="input" autoFocus placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
      {types.length > 1 && (
        <div className="row wrap" style={{ margin: '12px 0', gap: 6 }}>
          <button className={`chip ${type === 'all' ? 'active' : 'neutral'}`} onClick={() => setType('all')}>
            Tout
          </button>
          {types.map((t) => (
            <button key={t} className={`chip ${type === t ? 'active' : 'neutral'}`} onClick={() => setType(t)}>
              {ENTITY[t].plural}
            </button>
          ))}
        </div>
      )}
      <div style={{ maxHeight: 360, overflowY: 'auto', margin: '0 -8px 8px' }}>
        {list.length === 0 && <div className="empty">Aucun contenu à relier.</div>}
        {list.map((e) => (
          <button
            key={e.type + e.id}
            className="search-item"
            onClick={() => {
              onPick(e)
              onClose()
            }}
          >
            <Icon name={ENTITY[e.type].icon} size={17} />
            <div className="search-item-text">
              <div className="search-item-title">{e.title}</div>
              {e.sub && <div className="search-item-sub">{e.sub}</div>}
            </div>
            <span className="chip neutral">{ENTITY[e.type].label}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** Panneau « Relié à » : affiche et gère les liens d'un contenu. */
export function LinkedItems({ type, id, title = 'Relié à', compact = false }: { type: EntityType; id: string; title?: string; compact?: boolean }) {
  const links = useLinks(type, id)
  const [picking, setPicking] = useState(false)
  const navigate = useNavigate()
  const items =
    useLiveQuery(async () => (await Promise.all(links.map((l) => summarize(l.type, l.id)))).filter(Boolean) as EntitySummary[], [JSON.stringify(links)]) ?? []

  return (
    <div className={`linked ${compact ? 'compact' : ''}`}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="eyebrow">{title}</span>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => setPicking(true)}>
          <Icon name="link" size={14} /> Relier
        </button>
      </div>
      {items.length === 0 ? (
        <p className="faint" style={{ fontSize: '0.85rem' }}>
          Aucun lien pour l’instant.
        </p>
      ) : (
        <div className="linked-list">
          {items.map((e) => (
            <div key={e.type + e.id} className="linked-item">
              <button className="linked-open" onClick={() => navigate(ENTITY[e.type].route(e.id))}>
                <Icon name={ENTITY[e.type].icon} size={15} />
                <span className="linked-title">{e.title}</span>
                <span className="faint linked-type">{ENTITY[e.type].label}</span>
              </button>
              <button className="btn ghost icon sm" aria-label="Retirer le lien" onClick={() => unlink(type, id, e.type, e.id)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <LinkPicker open={picking} onClose={() => setPicking(false)} exclude={[id, ...links.map((l) => l.id)]} onPick={(e) => link(type, id, e.type, e.id)} />
    </div>
  )
}
