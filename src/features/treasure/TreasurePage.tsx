import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { pickFiles, saveAsset, useAssetUrl } from '../../db/assets'
import type { Treasure, TreasureKind } from '../../db/types'
import { Icon } from '../../components/Icon'
import { Modal, useUI } from '../../components/ui'
import { ThoughtsTabs } from '../thoughts/ThoughtsTabs'
import './treasure.css'

const KINDS: { id: TreasureKind; label: string; plural: string; placeholder: string; emoji: string; example: string }[] = [
  { id: 'phrase', label: 'Une phrase', plural: 'Phrases', emoji: '❝', placeholder: 'Une phrase qui me touche ou me donne de l’élan…', example: 'Une citation, un mot qu’on t’a dit, une phrase à toi' },
  { id: 'souvenir', label: 'Un souvenir', plural: 'Souvenirs', emoji: '🌸', placeholder: 'Un moment que j’aime me rappeler…', example: 'Un moment doux que tu aimes te rappeler' },
  { id: 'victoire', label: 'Une petite victoire', plural: 'Petites victoires', emoji: '★', placeholder: 'Ce que j’ai réussi, même petit…', example: '« J’ai joué mon morceau sans m’arrêter »' },
  { id: 'image', label: 'Une image', plural: 'Images', emoji: '🖼️', placeholder: 'Une légende (facultative)', example: 'Une photo qui te fait sourire' },
  { id: 'bienfait', label: 'Ce qui me fait du bien', plural: 'Ce qui me fait du bien', emoji: '🍃', placeholder: 'Une chose qui m’apaise ou me rend heureuse…', example: 'Un bain chaud, une chanson, une balade' },
]

/** Sa collection personnelle de positif. Rien d'imposé : c'est elle qui choisit. */
export function TreasurePage() {
  const { confirm } = useUI()
  const items = useLiveQuery(() => db.treasures.orderBy('createdAt').reverse().toArray(), []) ?? []
  const [kind, setKind] = useState<TreasureKind | 'all'>('all')
  const [adding, setAdding] = useState<TreasureKind | null>(null)
  const [draft, setDraft] = useState({ text: '', imageId: null as string | null })
  const [help, setHelp] = useState(false)
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
      <div style={{ marginBottom: 22 }}>
        <ThoughtsTabs />
      </div>
      <div className="page-head">
        <div>
          <h1>Mes petits bonheurs</h1>
          <p className="sub">Un endroit pour garder tout ce qui te fait du bien.</p>
        </div>
        <span className="spacer" />
        {items.length > 0 && (
          <button className="btn" onClick={() => setDrawn(items[Math.floor(Math.random() * items.length)])}>
            <Icon name="sparkle" size={16} /> Un petit bonheur au hasard
          </button>
        )}
      </div>

      {(items.length === 0 || help) && (
        <div className="card pad joy-help">
          <h3>À quoi ça sert ?</h3>
          <ul>
            <li><b>Garder</b> ce qui te fait du bien : une phrase, un souvenir, une petite victoire, une image…</li>
            <li><b>Relire</b> tout ça quand tu en as besoin, ou en <b>tirer un au hasard</b>.</li>
            <li>Tes <b>phrases</b> apparaissent aussi de temps en temps à l’ouverture de Minion, avec les phrases douces.</li>
          </ul>
          <p className="faint" style={{ fontSize: '0.84rem' }}>Rien n’est obligatoire : tu ajoutes ce que tu veux, quand tu veux.</p>
        </div>
      )}
      {items.length > 0 && !help && (
        <button className="btn ghost sm" style={{ marginBottom: 14 }} onClick={() => setHelp(true)}>
          <Icon name="sparkle" size={14} /> À quoi ça sert ?
        </button>
      )}

      <div className="joy-kinds">
        {KINDS.map((k) => (
          <button key={k.id} className="joy-kind" onClick={() => setAdding(k.id)}>
            <span className="joy-kind-emoji">{k.emoji}</span>
            <span className="joy-kind-label"><Icon name="plus" size={13} /> {k.label}</span>
            <span className="joy-kind-ex">{k.example}</span>
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
          <span className="hand">Rien pour l’instant</span>
          Choisis ci-dessus ce que tu veux garder en premier.
        </div>
      ) : (
        <div className="treasures">
          {shown.map((t) => (
            <TreasureCard
              key={t.id}
              t={t}
              onDelete={async () => {
                if (await confirm({ title: 'Retirer ce petit bonheur ?', confirmLabel: 'Retirer', danger: true })) await db.treasures.delete(t.id)
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
