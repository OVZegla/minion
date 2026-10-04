import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { pickFiles, saveAsset, useAssetUrl } from '../../db/assets'
import type { Treasure, TreasureKind } from '../../db/types'
import { Icon } from '../../components/Icon'
import { Modal, useUI } from '../../components/ui'
import './treasure.css'

const KINDS: { id: TreasureKind; label: string; plural: string; placeholder: string }[] = [
  { id: 'phrase', label: 'Phrase', plural: 'Phrases', placeholder: 'Une phrase qui me fait du bien…' },
  { id: 'souvenir', label: 'Souvenir', plural: 'Souvenirs', placeholder: 'Un souvenir agréable…' },
  { id: 'victoire', label: 'Victoire', plural: 'Petites victoires', placeholder: 'Une petite victoire…' },
  { id: 'image', label: 'Image', plural: 'Images', placeholder: 'Une légende (facultative)' },
  { id: 'bienfait', label: 'Bienfait', plural: 'Ce qui me fait du bien', placeholder: 'Une chose qui me fait du bien…' },
]

/** Sa collection personnelle de positif. Rien d'imposé : c'est elle qui choisit. */
export function TreasurePage() {
  const { confirm } = useUI()
  const items = useLiveQuery(() => db.treasures.orderBy('createdAt').reverse().toArray(), []) ?? []
  const [kind, setKind] = useState<TreasureKind | 'all'>('all')
  const [adding, setAdding] = useState<TreasureKind | null>(null)
  const [draft, setDraft] = useState({ text: '', imageId: null as string | null })
  const [drawn, setDrawn] = useState<Treasure | null>(null)

  const shown = items.filter((t) => kind === 'all' || t.kind === kind)

  const save = async () => {
    if (!adding || (!draft.text.trim() && !draft.imageId)) return
    await db.treasures.add({ ...base(), kind: adding, text: draft.text.trim(), imageId: draft.imageId })
    setAdding(null)
    setDraft({ text: '', imageId: null })
  }

  return (
    <div className="page treasure-page">
      <div className="page-head">
        <div>
          <h1>Mon trésor</h1>
          <p className="sub">Ce que je choisis de garder près de moi. Mes phrases rejoignent aussi celles de l’ouverture.</p>
        </div>
        <span className="spacer" />
        {items.length > 0 && (
          <button className="btn" onClick={() => setDrawn(items[Math.floor(Math.random() * items.length)])}>
            <Icon name="sparkle" size={16} /> Un trésor au hasard
          </button>
        )}
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 22 }}>
        {KINDS.map((k) => (
          <button key={k.id} className="btn sm" onClick={() => setAdding(k.id)}>
            <Icon name="plus" size={14} /> {k.label}
          </button>
        ))}
      </div>

      <div className="row wrap" style={{ gap: 6, marginBottom: 20 }}>
        <button className={`chip ${kind === 'all' ? 'active' : 'neutral'}`} onClick={() => setKind('all')}>
          Tout
        </button>
        {KINDS.map((k) => (
          <button key={k.id} className={`chip ${kind === k.id ? 'active' : 'neutral'}`} onClick={() => setKind(k.id)}>
            {k.plural} · {items.filter((t) => t.kind === k.id).length}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <span className="hand">Un coffre tout neuf</span>
          Garde ici ce qui te réchauffe le cœur.
        </div>
      ) : (
        <div className="treasures">
          {shown.map((t) => (
            <TreasureCard
              key={t.id}
              t={t}
              onDelete={async () => {
                if (await confirm({ title: 'Retirer ce trésor ?', confirmLabel: 'Retirer', danger: true })) await db.treasures.delete(t.id)
              }}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!adding}
        onClose={() => setAdding(null)}
        title={KINDS.find((k) => k.id === adding)?.label}
        width={460}
        footer={
          <>
            <button className="btn ghost" onClick={() => setAdding(null)}>
              Annuler
            </button>
            <button className="btn primary" onClick={save} disabled={!draft.text.trim() && !draft.imageId}>
              Garder
            </button>
          </>
        }
      >
        <textarea className="textarea" autoFocus placeholder={KINDS.find((k) => k.id === adding)?.placeholder} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="btn sm"
            onClick={async () => {
              const [f] = await pickFiles('image/*')
              if (f) setDraft({ ...draft, imageId: await saveAsset(f) })
            }}
          >
            <Icon name="image" size={14} /> {draft.imageId ? 'Changer l’image' : 'Ajouter une image'}
          </button>
          {draft.imageId && <span className="faint" style={{ fontSize: '0.8rem' }}>Image ajoutée</span>}
        </div>
      </Modal>

      <Modal open={!!drawn} onClose={() => setDrawn(null)} width={480}>
        {drawn && (
          <div className="treasure-drawn">
            <div className="hand">pour toi</div>
            <TreasureCard t={drawn} />
            <button className="btn" onClick={() => setDrawn(items[Math.floor(Math.random() * items.length)])}>
              Un autre
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function TreasureCard({ t, onDelete }: { t: Treasure; onDelete?: () => void }) {
  const url = useAssetUrl(t.imageId)
  return (
    <article className={`treasure t-${t.kind}`}>
      {url && <img src={url} alt="" />}
      {t.text && <p>{t.text}</p>}
      <div className="treasure-foot">
        <span>{KINDS.find((k) => k.id === t.kind)?.label}</span>
        {onDelete && (
          <button className="btn ghost icon sm" aria-label="Retirer" onClick={onDelete}>
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
    </article>
  )
}
