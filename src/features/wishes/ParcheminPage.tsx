import { useMemo, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { useAssetUrl } from '../../db/assets'
import { useSettings } from '../../db/settings'
import type { Wish, WishState } from '../../db/types'
import { Icon } from '../../components/Icon'
import { normalize } from '../../components/SearchPalette'
import { fmtDay, parseYmd } from '../../lib/dates'
import { WISH_ORDER, WISH_STATES } from './meta'
import { WishDetail } from './WishDetail'
import { deName } from '../../lib/phrases'
import './parchemin.css'

const NO_GROUP = 'Mes envies'

export function ParcheminPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'parchemin' | 'organise'>('parchemin')
  const wishes = useLiveQuery(() => db.wishes.orderBy('order').toArray(), []) ?? []
  const openId = params.get('envie')
  const open = wishes.find((w) => w.id === openId)
  const groups = useMemo(() => [...new Set(wishes.map((w) => w.group || NO_GROUP))], [wishes])

  const create = async (group?: string) => {
    const w: Wish = { ...base(), title: '', description: '', category: settings.wishCategories[0] ?? 'Rêve', state: 'someday', order: wishes.length, group: group === NO_GROUP ? '' : group ?? '', style: 'carte' }
    await db.wishes.add(w)
    setParams({ envie: w.id })
  }

  return (
    <div className="page wide parchemin-page">
      <div className="page-head no-print">
        <div>
          <h1>Mon parchemin</h1>
          <p className="sub">Tout ce que j’ai envie de faire, de découvrir, de créer et de vivre.</p>
        </div>
        <span className="spacer" />
        <div className="seg">
          <button className={view === 'parchemin' ? 'on' : ''} onClick={() => setView('parchemin')}>
            Parchemin
          </button>
          <button className={view === 'organise' ? 'on' : ''} onClick={() => setView('organise')}>
            Vue organisée
          </button>
        </div>
        <button className="btn ghost icon" aria-label="Imprimer le parchemin" title="Imprimer / PDF" onClick={() => window.print()}>
          <Icon name="printer" size={18} />
        </button>
        <button className="btn primary" onClick={() => create()}>
          <Icon name="plus" size={16} /> Une envie
        </button>
      </div>

      {view === 'parchemin' ? <ScrollView wishes={wishes} groups={groups} onOpen={(id) => setParams({ envie: id })} onCreate={create} name={settings.name} /> : <OrganizedView wishes={wishes} onOpen={(id) => setParams({ envie: id })} />}

      {open && <WishDetail wish={open} groups={groups.filter((g) => g !== NO_GROUP)} onClose={() => setParams({})} />}
    </div>
  )
}

/* ---------------- Vue parchemin ---------------- */

function ScrollView({ wishes, groups, onOpen, onCreate, name }: { wishes: Wish[]; groups: string[]; onOpen: (id: string) => void; onCreate: (g?: string) => void; name: string }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  /** Déplace l'envie avant `targetId` (ou en fin de groupe) et renumérote. */
  const moveTo = async (id: string, group: string, targetId: string | null) => {
    const list = wishes.filter((w) => w.id !== id)
    const moving = wishes.find((w) => w.id === id)
    if (!moving) return
    const updated = { ...moving, group: group === NO_GROUP ? '' : group }
    let idx = targetId ? list.findIndex((w) => w.id === targetId) : -1
    if (idx < 0) {
      // fin du groupe
      const lastInGroup = list.map((w, i) => ((w.group || NO_GROUP) === group ? i : -1)).filter((i) => i >= 0).pop()
      idx = lastInGroup === undefined ? list.length : lastInGroup + 1
    }
    list.splice(idx, 0, updated)
    await db.transaction('rw', db.wishes, async () => {
      await Promise.all(list.map((w, i) => (w.order !== i || w.id === id ? db.wishes.put({ ...w, order: i, ...(w.id === id ? { updatedAt: Date.now() } : {}) }) : null)))
    })
  }

  const onDrop = (e: DragEvent, group: string, targetId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    const id = e.dataTransfer.getData('text/wish')
    setDragId(null)
    setOverId(null)
    if (id && id !== targetId) moveTo(id, group, targetId)
  }

  return (
    <div className="scroll-wrap">
      <div className="scroll-roll top" aria-hidden />
      <div className="scroll-paper print-area">
        <div className="scroll-title">
          <div className="hand">le parchemin</div>
          <h2>{deName(name)}</h2>
          <Flourish />
        </div>

        {wishes.length === 0 && (
          <div className="empty">
            <span className="hand">Tout reste à écrire</span>
            <p style={{ marginBottom: 18 }}>Une envie, un rêve, une petite chose à vivre…</p>
            <button className="btn primary no-print" onClick={() => onCreate()}>
              Inscrire ma première envie
            </button>
          </div>
        )}

        {groups.map((g) => {
          const items = wishes.filter((w) => (w.group || NO_GROUP) === g)
          return (
            <section key={g} className="scroll-group" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, g, null)}>
              <h3 className="scroll-group-title">
                <span>{g}</span>
              </h3>
              <div className="scroll-items">
                {items.map((w, i) => (
                  <WishCard
                    key={w.id}
                    wish={w}
                    index={i}
                    dragging={dragId === w.id}
                    over={overId === w.id}
                    onOpen={() => onOpen(w.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/wish', w.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragId(w.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverId(null)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (overId !== w.id) setOverId(w.id)
                    }}
                    onDrop={(e) => onDrop(e, g, w.id)}
                  />
                ))}
                <button className="scroll-add no-print" onClick={() => onCreate(g)}>
                  <Icon name="plus" size={18} />
                  <span>Ajouter ici</span>
                </button>
              </div>
            </section>
          )
        })}
        {wishes.length > 0 && <p className="scroll-hint no-print faint">Glisse les envies pour les déplacer ou les regrouper. Indique un groupe dans une envie pour créer une nouvelle section.</p>}
      </div>
      <div className="scroll-roll bottom" aria-hidden />
    </div>
  )
}

function WishCard({
  wish,
  index,
  dragging,
  over,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  wish: Wish
  index: number
  dragging: boolean
  over: boolean
  onOpen: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}) {
  const img = useAssetUrl(wish.imageId)
  const style = wish.style ?? 'carte'
  // légère inclinaison stable, pour un rendu « posé à la main »
  const tilt = ((hash(wish.id) % 5) - 2) * 0.6
  const st = WISH_STATES[wish.state]
  return (
    <article
      className={`wish wish-${style} state-${wish.state} ${dragging ? 'dragging' : ''} ${over ? 'over' : ''}`}
      style={{ ['--tilt' as string]: `${tilt}deg`, animationDelay: `${Math.min(index, 12) * 40}ms` }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      {img && style !== 'note' && <img className="wish-img" src={img} alt="" draggable={false} />}
      <div className="wish-body">
        <div className="wish-cat">
          {wish.emoji && <span>{wish.emoji}</span>} {wish.category}
        </div>
        <h4 className="wish-title">{wish.title || 'Une envie sans nom'}</h4>
        {wish.description && style !== 'polaroid' && <p className="wish-desc">{wish.description}</p>}
        <div className="wish-foot">
          <span className="wish-state" style={{ ['--c' as string]: st.color }}>
            {wish.state === 'done' && <Icon name="check" size={12} strokeWidth={2.4} />} {st.label}
          </span>
          {wish.date && <span className="faint">{fmtDay(parseYmd(wish.date))}</span>}
        </div>
      </div>
    </article>
  )
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function Flourish() {
  return (
    <svg className="flourish" viewBox="0 0 240 24" aria-hidden>
      <path d="M2 12 C 40 2, 70 22, 120 12 S 200 2, 238 12" />
      <circle cx="120" cy="12" r="3" />
    </svg>
  )
}

/* ---------------- Vue organisée ---------------- */

function OrganizedView({ wishes, onOpen }: { wishes: Wish[]; onOpen: (id: string) => void }) {
  const [state, setState] = useState<WishState | 'all'>('all')
  const [cat, setCat] = useState<string>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'order' | 'recent' | 'date' | 'alpha'>('order')
  const cats = [...new Set(wishes.map((w) => w.category))]

  const list = useMemo(() => {
    const n = normalize(q)
    const l = wishes
      .filter((w) => state === 'all' || w.state === state)
      .filter((w) => cat === 'all' || w.category === cat)
      .filter((w) => !n || normalize(`${w.title} ${w.description} ${w.group}`).includes(n))
    if (sort === 'recent') l.sort((a, b) => b.updatedAt - a.updatedAt)
    if (sort === 'alpha') l.sort((a, b) => a.title.localeCompare(b.title))
    if (sort === 'date') l.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
    return l
  }, [wishes, state, cat, q, sort])

  return (
    <div>
      <div className="org-filters">
        <div className="lib-search">
          <Icon name="search" size={16} />
          <input placeholder="Chercher une envie…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={`chip ${state === 'all' ? 'active' : 'neutral'}`} onClick={() => setState('all')}>
            Toutes · {wishes.length}
          </button>
          {WISH_ORDER.map((s) => (
            <button key={s} className={`chip ${state === s ? 'active' : 'neutral'}`} onClick={() => setState(s)}>
              {WISH_STATES[s].label} · {wishes.filter((w) => w.state === s).length}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <select className="select" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Toutes catégories</option>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="order">Ordre du parchemin</option>
          <option value="recent">Modifiées récemment</option>
          <option value="date">Par date</option>
          <option value="alpha">Alphabétique</option>
        </select>
      </div>

      {list.length === 0 ? (
        <div className="empty">Aucune envie ne correspond.</div>
      ) : (
        <div className="card org-table">
          {list.map((w) => (
            <button key={w.id} className="org-row" onClick={() => onOpen(w.id)}>
              <span className="org-emoji">{w.emoji ?? '✦'}</span>
              <span className="org-title">{w.title || 'Une envie sans nom'}</span>
              <span className="faint org-cell">{w.category}</span>
              <span className="faint org-cell">{w.group || '—'}</span>
              <span className="faint org-cell">{w.date ? fmtDay(parseYmd(w.date)) : ''}</span>
              <span className="wish-state" style={{ ['--c' as string]: WISH_STATES[w.state].color }}>
                {WISH_STATES[w.state].label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
