import { useEffect, useState } from 'react'
import { updateSettings, useSettings } from '../../db/settings'
import { downloadBackup, restoreBackup, storageEstimate } from '../../db/backup'
import { pickFiles } from '../../db/assets'
import { Icon } from '../../components/Icon'
import { Splash } from '../../components/Splash'
import { useUI } from '../../components/ui'
import { relative } from '../../lib/dates'
import { isInstalled, isIOS, useInstall } from '../../lib/install'
import './settings.css'

const ACCENTS = [
  { id: 'rose', name: 'Rose poudré', color: '#c98b8b' },
  { id: 'sauge', name: 'Sauge', color: '#8fa58a' },
  { id: 'lavande', name: 'Lavande', color: '#a397c4' },
  { id: 'terracotta', name: 'Terracotta', color: '#c8805f' },
  { id: 'brume', name: 'Bleu brume', color: '#7f9db5' },
]

export function SettingsPage() {
  const s = useSettings()
  const { confirm, toast } = useUI()
  const [preview, setPreview] = useState(false)
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null)
  const [cat, setCat] = useState('')
  const lastBackup = (() => {
    try {
      return Number(localStorage.getItem('minion:lastBackup')) || 0
    } catch {
      return 0
    }
  })()

  useEffect(() => {
    storageEstimate().then(setStorage)
  }, [])

  return (
    <div className="page narrow settings">
      <div className="page-head">
        <h1>Réglages</h1>
      </div>

      <section className="card pad set-section">
        <h3>Toi</h3>
        <label className="label" style={{ marginTop: 12 }}>
          Prénom
        </label>
        <input className="input" style={{ maxWidth: 280 }} value={s.name} onChange={(e) => updateSettings({ name: e.target.value })} />
      </section>

      <section className="card pad set-section">
        <h3>Apparence</h3>
        <span className="label" style={{ marginTop: 14 }}>
          Couleur d’accent
        </span>
        <div className="row wrap" style={{ gap: 10 }}>
          {ACCENTS.map((a) => (
            <button key={a.id} className={`accent-pick ${s.accent === a.id ? 'on' : ''}`} onClick={() => updateSettings({ accent: a.id })}>
              <span style={{ background: a.color }} />
              {a.name}
            </button>
          ))}
        </div>
        <span className="label" style={{ marginTop: 18 }}>
          Ambiance
        </span>
        <div className="seg">
          <button className={s.theme === 'jour' ? 'on' : ''} onClick={() => updateSettings({ theme: 'jour' })}>
            <Icon name="sun" size={14} /> Jour (crème)
          </button>
          <button className={s.theme === 'soir' ? 'on' : ''} onClick={() => updateSettings({ theme: 'soir' })}>
            <Icon name="moon" size={14} /> Soir
          </button>
        </div>
      </section>

      <section className="card pad set-section">
        <h3>Ouverture</h3>
        <label className="row" style={{ marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={s.splash} onChange={(e) => updateSettings({ splash: e.target.checked })} />
          Afficher « Bonjour / Bonsoir {s.name} » et une phrase douce au lancement
        </label>
        <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setPreview(true)}>
          <Icon name="eye" size={14} /> Revoir l’animation
        </button>
      </section>

      <section className="card pad set-section">
        <h3>Catégories d’envies</h3>
        <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
          {s.wishCategories.map((c) => (
            <span key={c} className="chip neutral">
              {c}
              <button className="tag-x" aria-label={`Retirer ${c}`} onClick={() => updateSettings({ wishCategories: s.wishCategories.filter((x) => x !== c) })}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10, maxWidth: 360 }}>
          <input
            className="input"
            placeholder="Nouvelle catégorie"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && cat.trim()) {
                updateSettings({ wishCategories: [...new Set([...s.wishCategories, cat.trim()])] })
                setCat('')
              }
            }}
          />
        </div>
      </section>

      <section className="card pad set-section">
        <h3>Types d’événements</h3>
        <div className="stack" style={{ gap: 6, marginTop: 12 }}>
          {s.eventKinds.map((k) => (
            <div key={k.id} className="row">
              <input type="color" className="color-input" value={k.color} onChange={(e) => updateSettings({ eventKinds: s.eventKinds.map((x) => (x.id === k.id ? { ...x, color: e.target.value } : x)) })} aria-label={`Couleur de ${k.name}`} />
              <input className="input" style={{ maxWidth: 260 }} value={k.name} onChange={(e) => updateSettings({ eventKinds: s.eventKinds.map((x) => (x.id === k.id ? { ...x, name: e.target.value } : x)) })} />
            </div>
          ))}
        </div>
      </section>

      <InstallSection />

      <section className="card pad set-section">
        <h3>Tes données</h3>
        <p className="muted" style={{ margin: '8px 0 14px', fontSize: '0.92rem' }}>
          Tout est enregistré sur cet appareil, automatiquement. Garde de temps en temps une sauvegarde dans un fichier (sur une clé USB, un cloud…).
        </p>
        {storage && (
          <p className="faint" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
            Espace utilisé : {(storage.usage / 1e6).toFixed(1)} Mo{storage.persisted ? ' · stockage protégé contre l’effacement automatique' : ''}
          </p>
        )}
        <div className="row wrap">
          <button className="btn primary" onClick={() => downloadBackup().then(() => toast('Sauvegarde téléchargée'))}>
            <Icon name="download" size={15} /> Sauvegarder dans un fichier
          </button>
          <button
            className="btn"
            onClick={async () => {
              const [f] = await pickFiles('application/json,.json')
              if (!f) return
              if (!(await confirm({ title: 'Restaurer cette sauvegarde ?', message: 'Tout le contenu actuel de Minion sera remplacé par celui du fichier. Pense à sauvegarder d’abord si besoin.', confirmLabel: 'Restaurer', danger: true }))) return
              try {
                await restoreBackup(f)
                toast('Sauvegarde restaurée')
                setTimeout(() => location.reload(), 800)
              } catch (e) {
                toast(e instanceof Error ? e.message : 'La restauration a échoué', { kind: 'error' })
              }
            }}
          >
            <Icon name="upload" size={15} /> Restaurer une sauvegarde
          </button>
        </div>
        <p className="faint" style={{ fontSize: '0.8rem', marginTop: 10 }}>
          {lastBackup ? `Dernière sauvegarde ${relative(lastBackup)}.` : 'Aucune sauvegarde pour l’instant.'}
        </p>
      </section>

      <section className="card pad set-section">
        <h3>Ce qui existe aujourd’hui dans Minion</h3>
        <ul className="set-list">
          <li>Accueil personnalisable, capture rapide, recherche globale (Ctrl K)</li>
          <li>Notes : éditeur riche, dossiers, tags, favoris, boîte d’entrée, liens entre contenus, export PDF</li>
          <li>Mon parchemin : vue parchemin, vue organisée, souvenirs, impression</li>
          <li>Projets : liste, tableau, tâches, liens, documents, créations</li>
          <li>Moodboards : composition libre, modèles, export PNG et PDF</li>
          <li>Calendrier : jour, semaine, mois, récurrences, rappels (app ouverte), tâches</li>
          <li>Journal, pensées à plat, mes petits bonheurs</li>
        </ul>
        <p className="faint" style={{ fontSize: '0.82rem', marginTop: 8 }}>
          En préparation : atelier synthé, apprentissage, atelier plume, studio graphique, pièces et maisons.
        </p>
      </section>

      {preview && <Splash name={s.name} onDone={() => setPreview(false)} />}
    </div>
  )
}

function InstallSection() {
  const { canInstall, install } = useInstall()
  return (
    <section className="card pad set-section">
      <h3>Installer Minion</h3>
      {isInstalled() ? (
        <p className="muted" style={{ marginTop: 8 }}>Minion est installé sur cet appareil. Les mises à jour arrivent toutes seules.</p>
      ) : isIOS() ? (
        <p className="muted" style={{ marginTop: 8 }}>Sur iPhone, Minion s’utilise directement dans Safari : rien à installer.</p>
      ) : canInstall ? (
        <div className="row" style={{ marginTop: 10 }}>
          <p className="muted" style={{ flex: 1 }}>Une icône sur le bureau, une fenêtre à part, et ça marche même sans internet.</p>
          <button className="btn primary" onClick={install}>Installer sur cet ordinateur</button>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 8, fontSize: '0.92rem' }}>
          Ouvre Minion dans Edge ou Chrome sur ordinateur pour l’installer en un clic, Sur iPhone, il s’utilise directement dans Safari.
        </p>
      )}
      <p className="faint" style={{ fontSize: '0.8rem', marginTop: 10 }}>Chaque appareil garde ses propres données : utilise la sauvegarde ci-dessous pour les transférer.</p>
    </section>
  )
}
