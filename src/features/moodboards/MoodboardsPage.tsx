import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { removeAllLinks } from '../../db/links'
import type { Moodboard } from '../../db/types'
import { Icon } from '../../components/Icon'
import { Menu, Modal, useUI } from '../../components/ui'
import { relative } from '../../lib/dates'
import { MoodboardThumb } from './MoodboardThumb'
import { TEMPLATES, instantiate } from './templates'
import './moodboard.css'

export function MoodboardsPage() {
  const navigate = useNavigate()
  const { confirm } = useUI()
  const [picking, setPicking] = useState(false)
  const boards = useLiveQuery(() => db.moodboards.orderBy('updatedAt').reverse().toArray(), []) ?? []

  const create = async (tid: string) => {
    const t = TEMPLATES.find((x) => x.id === tid)!
    const m: Moodboard = { ...base(), title: t.id === 'libre' ? '' : t.name, background: t.background, items: instantiate(t) }
    await db.moodboards.add(m)
    navigate(`/moodboards/${m.id}`)
  }

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1>Moodboards</h1>
          <p className="sub">Réunir images, couleurs, matières et mots.</p>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setPicking(true)}>
          <Icon name="plus" size={16} /> Nouveau moodboard
        </button>
      </div>

      {boards.length === 0 ? (
        <div className="empty">
          <span className="hand">Une toile blanche</span>
          <p style={{ marginBottom: 16 }}>Pars d’une composition libre ou d’un modèle.</p>
          <button className="btn primary" onClick={() => setPicking(true)}>
            Commencer
          </button>
        </div>
      ) : (
        <div className="mb-grid">
          {boards.map((b) => (
            <article key={b.id} className="card hoverable mb-card" onClick={() => navigate(`/moodboards/${b.id}`)}>
              <MoodboardThumb board={b} height={190} />
              <div className="row" style={{ padding: '12px 4px 2px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mb-card-title">
                    {b.featured && <Icon name="star" size={13} fill="var(--gold)" style={{ color: 'var(--gold)', marginRight: 4 }} />}
                    {b.title || 'Sans titre'}
                  </div>
                  <div className="faint" style={{ fontSize: '0.76rem' }}>
                    {relative(b.updatedAt)}
                  </div>
                </div>
                <Menu
                  trigger={
                    <button className="btn ghost icon sm" aria-label="Options">
                      <Icon name="more" size={16} />
                    </button>
                  }
                  items={[
                    {
                      label: b.featured ? 'Retirer de la une' : 'Mettre à la une (accueil)',
                      icon: 'star',
                      onClick: async () => {
                        await db.moodboards.toCollection().modify({ featured: false })
                        if (!b.featured) await db.moodboards.update(b.id, { featured: true })
                      },
                    },
                    {
                      label: 'Dupliquer',
                      icon: 'copy',
                      onClick: async () => {
                        await db.moodboards.add({ ...b, ...base(), title: `${b.title || 'Sans titre'} (copie)`, featured: false })
                      },
                    },
                    {
                      label: 'Supprimer',
                      icon: 'trash',
                      danger: true,
                      onClick: async () => {
                        if (!(await confirm({ title: 'Supprimer ce moodboard ?', message: 'Il sera effacé définitivement.', confirmLabel: 'Supprimer définitivement', danger: true }))) return
                        await removeAllLinks('moodboard', b.id)
                        await db.moodboards.delete(b.id)
                      },
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="Commencer un moodboard" width={760}>
        <div className="tpl-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="tpl"
              onClick={() => {
                setPicking(false)
                create(t.id)
              }}
            >
              <MoodboardThumb board={{ ...base(), title: t.name, background: t.background, items: instantiate(t) }} height={120} />
              <div className="tpl-name">{t.name}</div>
              <div className="faint tpl-desc">{t.description}</div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
