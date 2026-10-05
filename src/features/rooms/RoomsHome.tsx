import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Menu, Modal, useUI } from '../../components/ui'
import { relative } from '../../lib/dates'
import { STARTERS, furnitureCorners, planBounds } from './geometry'
import type { PlanData, RoomPlan } from './types'
import './rooms.css'

export function RoomsHome() {
  const navigate = useNavigate()
  const { confirm } = useUI()
  const [picking, setPicking] = useState(false)
  const plans = useLiveQuery(() => db.plans.orderBy('updatedAt').reverse().toArray(), []) ?? []

  const create = async (starterId: string) => {
    const st = STARTERS.find((s) => s.id === starterId)!
    const now = Date.now()
    const p: RoomPlan = { id: uid(), createdAt: now, updatedAt: now, title: starterId === 'empty' ? 'Mon plan' : st.name, data: st.build(), variants: [], ambience: { sun: 1, warm: 1, time: 'jour' } }
    await db.plans.add(p)
    navigate(`/pieces/${p.id}`)
  }

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1>Pièces et maisons</h1>
          <p className="sub">Imaginer un intérieur : dessiner le plan, placer les meubles, le voir en 3D.</p>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setPicking(true)}>
          <Icon name="plus" size={16} /> Nouveau plan
        </button>
      </div>
      {plans.length === 0 ? (
        <div className="empty">
          <span className="hand">Une pièce à imaginer</span>
          <p style={{ marginBottom: 16 }}>Pars d’une chambre, d’un salon ou d’un petit appartement, ou dessine tes propres murs.</p>
          <button className="btn primary" onClick={() => setPicking(true)}>Commencer</button>
        </div>
      ) : (
        <div className="plans">
          {plans.map((p) => (
            <article key={p.id} className="card hoverable plan-card" onClick={() => navigate(`/pieces/${p.id}`)}>
              <PlanThumb data={p.data} />
              <div className="row" style={{ padding: '10px 4px 2px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="plan-card-title">{p.title || 'Sans titre'}</div>
                  <div className="faint" style={{ fontSize: '0.76rem' }}>
                    {p.data.floors.length} pièce{p.data.floors.length > 1 ? 's' : ''} · {p.variants.length ? `${p.variants.length} variante${p.variants.length > 1 ? 's' : ''} · ` : ''}{relative(p.updatedAt)}
                  </div>
                </div>
                <Menu
                  trigger={
                    <button className="btn ghost icon sm" aria-label="Options">
                      <Icon name="more" size={16} />
                    </button>
                  }
                  items={[
                    { label: 'Dupliquer', icon: 'copy', onClick: () => db.plans.add({ ...p, id: uid(), title: `${p.title} (copie)`, createdAt: Date.now(), updatedAt: Date.now() }) },
                    {
                      label: 'Supprimer',
                      icon: 'trash',
                      danger: true,
                      onClick: async () => {
                        if (await confirm({ title: 'Supprimer ce plan ?', message: 'Il sera effacé définitivement, avec ses variantes.', confirmLabel: 'Supprimer définitivement', danger: true })) await db.plans.delete(p.id)
                      },
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={picking} onClose={() => setPicking(false)} title="Commencer un plan" width={720}>
        <div className="starters">
          {STARTERS.map((s) => (
            <button key={s.id} className="starter" onClick={() => { setPicking(false); create(s.id) }}>
              <PlanThumb data={s.build()} small />
              <b>{s.name}</b>
              <span className="faint">{s.description}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

/** Miniature du plan vu de dessus. */
export function PlanThumb({ data, small }: { data: PlanData; small?: boolean }) {
  const b = planBounds(data)
  const pad = 40
  return (
    <svg className="plan-thumb" viewBox={`${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} style={{ height: small ? 110 : 170 }}>
      {data.floors.map((f) => (
        <polygon key={f.id} points={f.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="#efe3d0" />
      ))}
      {data.furniture.map((f) => (
        <polygon key={f.id} points={furnitureCorners(f).map((p) => `${p.x},${p.y}`).join(' ')} fill={f.color} stroke="#00000022" strokeWidth={2} />
      ))}
      {data.walls.map((w) => (
        <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#4a423b" strokeWidth={w.thickness} strokeLinecap="square" />
      ))}
      {!data.walls.length && <text x={b.x + b.w / 2} y={b.y + b.h / 2} textAnchor="middle" fontSize={60} fill="#b8ab9a">✎</text>}
    </svg>
  )
}
