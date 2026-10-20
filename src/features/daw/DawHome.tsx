import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { Icon } from '../../components/Icon'
import { Mascot } from '../../components/Mascot'
import { Menu, Modal, useUI } from '../../components/ui'
import { relative } from '../../lib/dates'
import { soundEmoji } from './bank'
import { TEMPLATES } from './patterns'
import { beatsPerBar, clipBeats, projectEnd, type DawProject } from './types'
import './daw.css'

const uid = () => crypto.randomUUID()

export function DawHome() {
  const navigate = useNavigate()
  const { confirm } = useUI()
  const [picking, setPicking] = useState(false)
  const [params, setParams] = useSearchParams()
  const welcome = params.has('visite')
  const projects = useLiveQuery(() => db.daw.orderBy('updatedAt').reverse().toArray(), []) ?? []

  const create = async (tid: string) => {
    const p = TEMPLATES.find((t) => t.id === tid)!.build()
    await db.daw.add(p)
    navigate(`/musique/${p.id}`)
  }

  /** Premier morceau de la visite : le modèle Pop, piste voix non armée (pas de micro tout de suite). */
  const startTour = async () => {
    const p = TEMPLATES.find((t) => t.id === 'pop')!.build()
    p.title = 'Mon premier morceau'
    p.tracks = p.tracks.map((t) => ({ ...t, arm: false }))
    await db.daw.add(p)
    navigate(`/musique/${p.id}?visite=1`)
  }

  /** Leçon : un morceau vide, et Minion guide chaque geste. */
  const startLesson = async () => {
    const p = TEMPLATES.find((t) => t.id === 'empty')!.build()
    p.title = 'Ma première musique'
    p.tracks = []
    await db.daw.add(p)
    navigate(`/musique/${p.id}?lecon=1`)
  }

  const remove = async (p: DawProject) => {
    if (!(await confirm({ title: 'Supprimer ce morceau ?', message: 'Il sera effacé définitivement, avec ses prises de voix.', confirmLabel: 'Supprimer définitivement', danger: true }))) return
    const ids = new Set(p.tracks.flatMap((t) => t.clips.map((c) => c.audioId).filter(Boolean) as string[]))
    // une prise peut être partagée par un morceau dupliqué : on ne l'efface que si plus personne ne l'utilise
    const others = (await db.daw.toArray()).filter((x) => x.id !== p.id)
    for (const o of others) for (const t of o.tracks) for (const c of t.clips) if (c.audioId) ids.delete(c.audioId)
    await db.dawAudio.bulkDelete([...ids])
    await db.daw.delete(p.id)
  }

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1>Studio musique</h1>
          <p className="sub">Enregistrer sa voix, composer sur plusieurs pistes avec des centaines d’instruments, mixer, exporter.</p>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={startLesson} title="Minion t’apprend, geste par geste, à créer une musique de zéro">
          🎓 Apprendre à créer une musique
        </button>
        <button className="btn" onClick={startTour} title="Minion te fait visiter le studio">
          <Icon name="sparkle" size={16} /> Visite guidée
        </button>
        <button className="btn primary" onClick={() => setPicking(true)}>
          <Icon name="plus" size={16} /> Nouveau morceau
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="dwh-start">
          <span className="hand">Le premier morceau</span>
          <p>Choisis un point de départ : une piste pour chanter, ou un petit groupe déjà prêt à jouer.</p>
          <Templates onPick={create} />
        </div>
      ) : (
        <div className="dwh-list">
          {projects.map((p) => {
            const bars = Math.ceil(projectEnd(p) / beatsPerBar(p.timeSig))
            return (
              <article key={p.id} className="card hoverable dwh-card" onClick={() => navigate(`/musique/${p.id}`)}>
                <Thumb p={p} />
                <div className="row" style={{ padding: '10px 4px 2px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dwh-title">{p.title || 'Sans titre'}</div>
                    <div className="faint" style={{ fontSize: '0.76rem' }}>
                      {p.tracks.length} piste{p.tracks.length > 1 ? 's' : ''} · {p.bpm} BPM · {bars} mesure{bars > 1 ? 's' : ''} · {relative(p.updatedAt)}
                    </div>
                  </div>
                  <Menu
                    trigger={
                      <button className="btn ghost icon sm" aria-label="Options">
                        <Icon name="more" size={16} />
                      </button>
                    }
                    items={[
                      { label: 'Dupliquer', icon: 'copy', onClick: () => db.daw.add({ ...p, id: uid(), title: `${p.title} (copie)`, createdAt: Date.now(), updatedAt: Date.now() }) },
                      { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => remove(p) },
                    ]}
                  />
                </div>
              </article>
            )
          })}
        </div>
      )}

      {welcome && (
        <div className="dwh-welcome" onClick={(e) => e.target === e.currentTarget && setParams({}, { replace: true })}>
          <div className="dwh-welcome-card">
            <Mascot size={92} className="dwh-welcome-mascot" />
            <div>
              <h2>Bienvenue dans ton studio 🎶</h2>
              <p>Ici, tu peux enregistrer ta voix, composer avec plus de 300 instruments, ajouter des effets et mixer, comme dans un vrai studio.</p>
              <p>Tes morceaux seront rangés sur cette page. On crée ta première musique ensemble, de zéro ? Je te guide geste par geste, et je vérifie avec toi à chaque étape.</p>
              <div className="row">
                <button className="btn primary" onClick={startLesson}>
                  🎓 Apprendre pas à pas
                </button>
                <button className="btn" onClick={startTour}>
                  Juste une petite visite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="Commencer un morceau" width={760}>
        <Templates
          onPick={(id) => {
            setPicking(false)
            create(id)
          }}
        />
      </Modal>
    </div>
  )
}

function Templates({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="dwh-templates">
      {TEMPLATES.map((t) => (
        <button key={t.id} className="dwh-template" onClick={() => onPick(t.id)}>
          <span className="dwh-emoji">{t.emoji}</span>
          <b>{t.name}</b>
          <span className="faint">{t.description}</span>
        </button>
      ))}
    </div>
  )
}

/** Miniature : une ligne par piste, avec ses clips. */
function Thumb({ p }: { p: DawProject }) {
  const end = Math.max(projectEnd(p), beatsPerBar(p.timeSig) * 4)
  const rows = Math.max(3, p.tracks.length)
  return (
    <div className="dwh-thumb">
      {p.tracks.slice(0, 6).map((t) => (
        <div key={t.id} className="dwh-lane" style={{ height: `${100 / Math.min(6, rows)}%` }}>
          <span className="dwh-lane-ico">{t.kind === 'audio' ? '🎙️' : soundEmoji(t.instrument)}</span>
          {t.clips.map((c) => (
            <i key={c.id} style={{ left: `${(c.start / end) * 88 + 10}%`, width: `${(clipBeats(c, p.bpm) / end) * 88}%`, background: t.color }} />
          ))}
        </div>
      ))}
    </div>
  )
}
