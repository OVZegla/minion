import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../../db/db'
import { link } from '../../db/links'
import type { Card, Deck, Note } from '../../db/types'
import { Icon } from '../../components/Icon'
import { LinkPicker } from '../../components/Linked'
import { RichEditor } from '../../components/editor/RichEditor'
import { SaveStatus, useAutosave, useUI } from '../../components/ui'
import { missingInfo, normalizeAnswer, proposeCards, proposeSummary, review, toCard, type Proposal } from './extract'
import './learn.css'

type Tab = 'cards' | 'summary' | 'review' | 'quiz' | 'cloze' | 'deepen'
const TABS: { id: Tab; label: string }[] = [
  { id: 'cards', label: 'Cartes' },
  { id: 'summary', label: 'Fiche' },
  { id: 'review', label: 'Réviser' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'cloze', label: 'Texte à trous' },
  { id: 'deepen', label: 'À approfondir' },
]

export function DeckPage() {
  const { id } = useParams()
  const d = useLiveQuery(() => db.decks.get(id!), [id])
  if (d === undefined) return null
  if (!d)
    return (
      <div className="page narrow empty">
        <span className="hand">Introuvable</span>Cette série n’existe plus.
      </div>
    )
  return <DeckEditor key={d.id} initial={d} />
}

function DeckEditor({ initial }: { initial: Deck }) {
  const navigate = useNavigate()
  const [deck, setDeck] = useState(initial)
  const [tab, setTab] = useState<Tab>(initial.cards.length ? 'review' : 'cards')
  const [picking, setPicking] = useState(false)
  const notes = (useLiveQuery(() => db.notes.bulkGet(deck.noteIds), [deck.noteIds.join()]) ?? []).filter(Boolean) as Note[]
  const state = useAutosave(deck, (v) => db.decks.update(initial.id, { title: v.title, topic: v.topic, noteIds: v.noteIds, cards: v.cards, summary: v.summary, deepen: v.deepen, lastSessionAt: v.lastSessionAt, updatedAt: Date.now() }))
  const set = (p: Partial<Deck>) => setDeck((d) => ({ ...d, ...p }))
  const due = deck.cards.filter((c) => c.dueAt <= Date.now()).length

  return (
    <div className="page deck-page">
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn ghost sm" onClick={() => navigate('/apprendre')}>
          <Icon name="chevronLeft" size={16} /> Apprendre
        </button>
        <span className="spacer" />
        <SaveStatus state={state} />
      </div>
      <input className="title-input" value={deck.title} placeholder="Titre de la série" onChange={(e) => set({ title: e.target.value })} />
      <input className="deck-topic" value={deck.topic} placeholder="Sujet (facultatif)" onChange={(e) => set({ topic: e.target.value })} />

      <div className="deck-sources">
        <span className="eyebrow">Notes sources</span>
        {notes.map((n) => (
          <span key={n.id} className="chip neutral deck-source" onClick={() => navigate(`/notes/${n.id}`)}>
            <Icon name="book" size={12} /> {n.title || 'Sans titre'}
            <button
              className="tag-x"
              aria-label="Retirer cette note"
              onClick={(e) => {
                e.stopPropagation()
                set({ noteIds: deck.noteIds.filter((x) => x !== n.id) })
              }}
            >
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
        <button className="btn ghost sm" onClick={() => setPicking(true)}>
          <Icon name="plus" size={13} /> Ajouter une note
        </button>
      </div>

      <div className="deck-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`deck-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'review' && due > 0 && <span className="deck-badge">{due}</span>}
            {t.id === 'cards' && <span className="deck-count">{deck.cards.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'cards' && <CardsTab deck={deck} notes={notes} set={set} />}
      {tab === 'summary' && <SummaryTab deck={deck} notes={notes} set={set} />}
      {tab === 'review' && <ReviewTab deck={deck} notes={notes} set={set} />}
      {tab === 'quiz' && <QuizTab deck={deck} />}
      {tab === 'cloze' && <ClozeTab deck={deck} notes={notes} />}
      {tab === 'deepen' && <DeepenTab deck={deck} set={set} />}

      <LinkPicker
        open={picking}
        onClose={() => setPicking(false)}
        types={['note']}
        title="Ajouter une note source"
        exclude={deck.noteIds}
        onPick={(e) => {
          set({ noteIds: [...deck.noteIds, e.id] })
          link('deck', initial.id, 'note', e.id)
        }}
      />
    </div>
  )
}

type TabProps = { deck: Deck; notes: Note[]; set: (p: Partial<Deck>) => void }

/* ---------------- Cartes ---------------- */

function CardsTab({ deck, notes, set }: TabProps) {
  const { toast } = useUI()
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const missing = useMemo(() => missingInfo(notes), [notes])

  const add = () => {
    if (!q.trim() || !a.trim()) return
    set({ cards: [...deck.cards, toCard({ q: q.trim(), a: a.trim() }, false)] })
    setQ('')
    setA('')
  }
  const update = (id: string, p: Partial<Card>) => set({ cards: deck.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) })

  return (
    <div className="deck-section">
      <div className="card pad deck-new">
        <h3>Écrire une carte</h3>
        <input className="input" placeholder="Question" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 10 }} />
        <textarea className="textarea" placeholder="Réponse" value={a} onChange={(e) => setA(e.target.value)} style={{ marginTop: 8, minHeight: 60 }} />
        <div className="row" style={{ marginTop: 8 }}>
          <span className="spacer" />
          <button className="btn primary sm" onClick={add} disabled={!q.trim() || !a.trim()}>
            Ajouter
          </button>
        </div>
      </div>

      <div className="card pad deck-propose">
        <div className="row">
          <div style={{ flex: 1 }}>
            <h3>Propositions à partir de tes notes</h3>
            <p className="faint" style={{ fontSize: '0.84rem', marginTop: 4 }}>
              Minion repère dans <b>ton texte</b> les définitions (« terme : explication »), les questions déjà écrites, les mots en gras et les titres. Pas d’IA, rien d’inventé : tu choisis ce que tu gardes.
            </p>
          </div>
          <button className="btn" onClick={() => setProposals(proposeCards(notes).filter((p) => !deck.cards.some((c) => c.q === p.q)))} disabled={!notes.length}>
            <Icon name="sparkle" size={15} /> Proposer
          </button>
        </div>
        {missing.length > 0 && (
          <ul className="deck-missing">
            {missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        {proposals && (
          <div className="stack" style={{ marginTop: 14, gap: 8 }}>
            {proposals.length === 0 && <p className="muted">Rien à proposer dans ces notes. Astuce : écris « terme : définition », mets des mots en gras, ou pose des questions suivies de leur réponse.</p>}
            {proposals.map((p, i) => (
              <div key={i} className="proposal">
                <div className="proposal-rule">{p.rule}</div>
                <div className="proposal-q">{p.q}</div>
                <div className="proposal-a">{p.a}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="spacer" />
                  <button className="btn ghost sm" onClick={() => setProposals(proposals.filter((_, k) => k !== i))}>
                    Ignorer
                  </button>
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      set({ cards: [...deck.cards, toCard(p, true)] })
                      setProposals(proposals.filter((_, k) => k !== i))
                    }}
                  >
                    Garder
                  </button>
                </div>
              </div>
            ))}
            {proposals.length > 1 && (
              <button
                className="btn sm"
                onClick={() => {
                  set({ cards: [...deck.cards, ...proposals.map((p) => toCard(p, true))] })
                  toast(`${proposals.length} cartes ajoutées, marquées « à vérifier »`)
                  setProposals([])
                }}
              >
                Tout garder
              </button>
            )}
          </div>
        )}
      </div>

      <h3 style={{ margin: '28px 0 12px' }}>Mes cartes</h3>
      {deck.cards.length === 0 && <p className="muted">Aucune carte pour l’instant.</p>}
      <div className="stack" style={{ gap: 10 }}>
        {deck.cards.map((c) => (
          <div key={c.id} className={`card pad flash-row ${c.auto ? 'auto' : ''}`}>
            {c.auto && (
              <div className="flash-auto">
                <Icon name="sparkle" size={12} /> Proposée par Minion à partir de ta note · à vérifier
                <button className="btn ghost sm" onClick={() => update(c.id, { auto: false })}>
                  C’est juste
                </button>
              </div>
            )}
            <input className="flash-q" value={c.q} onChange={(e) => update(c.id, { q: e.target.value })} />
            <textarea className="flash-a" value={c.a} onChange={(e) => update(c.id, { a: e.target.value })} rows={2} />
            {c.source && (
              <details className="flash-source">
                <summary>Passage source</summary>
                <blockquote>{c.source}</blockquote>
              </details>
            )}
            <div className="row" style={{ marginTop: 6 }}>
              <span className="faint" style={{ fontSize: '0.76rem' }}>
                {c.seen ? `Revue ${c.seen} fois · ${['à revoir', 'débute', 'progresse', 'bien connue', 'maîtrisée'][c.box]}` : 'Jamais revue'}
              </span>
              <span className="spacer" />
              <button className="btn ghost icon sm" aria-label="Supprimer la carte" onClick={() => set({ cards: deck.cards.filter((x) => x.id !== c.id) })}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Fiche synthétique ---------------- */

function SummaryTab({ deck, notes, set }: TabProps) {
  const { confirm } = useUI()
  const [key, setKey] = useState(0)
  const missing = useMemo(() => missingInfo(notes), [notes])
  const generate = async () => {
    if (deck.summary?.text && !(await confirm({ title: 'Refaire la fiche ?', message: 'Ta fiche actuelle (et tes modifications) sera remplacée.', confirmLabel: 'Refaire' }))) return
    const s = proposeSummary(notes)
    set({ summary: { content: s.content, text: s.text, auto: true } })
    setKey((k) => k + 1)
  }
  return (
    <div className="deck-section">
      <div className="row" style={{ marginBottom: 12 }}>
        <p className="muted" style={{ flex: 1, fontSize: '0.9rem' }}>
          Une fiche courte pour revoir l’essentiel. Minion peut la préparer en reprenant tes titres, la première phrase de chaque paragraphe et tes mots en gras — puis tu la retouches.
        </p>
        <button className="btn" onClick={generate} disabled={!notes.length}>
          <Icon name="sparkle" size={15} /> {deck.summary ? 'Refaire depuis mes notes' : 'Préparer depuis mes notes'}
        </button>
      </div>
      {missing.length > 0 && (
        <ul className="deck-missing">
          {missing.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      {deck.summary?.auto && (
        <div className="flash-auto" style={{ marginBottom: 10 }}>
          <Icon name="sparkle" size={12} /> Fiche extraite de tes notes (sans IA) · relis-la et modifie-la librement
          <button className="btn ghost sm" onClick={() => set({ summary: { ...deck.summary!, auto: false } })}>
            Je l’ai relue
          </button>
        </div>
      )}
      <div className="card pad summary-paper">
        <RichEditor key={key} content={deck.summary?.content ?? null} placeholder="Écris ta fiche ici, ou laisse Minion la préparer depuis tes notes…" onChange={(content, text) => set({ summary: { content, text, auto: deck.summary?.auto ?? false } })} />
      </div>
    </div>
  )
}

/* ---------------- Révision (boîtes de Leitner) ---------------- */

function ReviewTab({ deck, set }: TabProps) {
  const [queue, setQueue] = useState<string[] | null>(null)
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState({ knew: 0, again: 0 })
  const due = deck.cards.filter((c) => c.dueAt <= Date.now())

  const start = (all: boolean) => {
    const list = (all ? deck.cards : due).map((c) => c.id).sort(() => Math.random() - 0.5)
    setQueue(list)
    setShown(false)
    setDone({ knew: 0, again: 0 })
  }
  if (!deck.cards.length) return <p className="muted deck-section">Ajoute des cartes pour pouvoir réviser.</p>

  if (!queue)
    return (
      <div className="deck-section review-start">
        <div className="hand" style={{ fontSize: '1.8rem' }}>Une petite séance ?</div>
        <p className="muted" style={{ margin: '8px 0 18px' }}>
          {due.length ? `${due.length} carte${due.length > 1 ? 's' : ''} à revoir aujourd’hui.` : 'Tout est à jour. Tu peux quand même revoir tes cartes.'}
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {due.length > 0 && <button className="btn primary" onClick={() => start(false)}>Réviser {due.length} carte{due.length > 1 ? 's' : ''}</button>}
          <button className="btn" onClick={() => start(true)}>Revoir toutes les cartes</button>
        </div>
        <p className="faint" style={{ fontSize: '0.8rem', marginTop: 18 }}>Les cartes que tu connais reviennent de moins en moins souvent (1, 3, 7 puis 16 jours).</p>
      </div>
    )

  const card = deck.cards.find((c) => c.id === queue[0])
  if (!card)
    return (
      <div className="deck-section review-start">
        <div className="hand" style={{ fontSize: '1.8rem' }}>Séance terminée</div>
        <p className="muted" style={{ margin: '8px 0 18px' }}>
          {done.knew + done.again} carte{done.knew + done.again > 1 ? 's' : ''} revue{done.knew + done.again > 1 ? 's' : ''}. {done.again > 0 ? `${done.again} reviendront bientôt, c’est comme ça qu’on apprend.` : 'Joli travail.'}
        </p>
        <button className="btn" onClick={() => setQueue(null)}>Retour</button>
      </div>
    )

  const answer = (knew: boolean) => {
    set({ cards: deck.cards.map((c) => (c.id === card.id ? review(c, knew) : c)), lastSessionAt: Date.now() })
    setDone((d) => (knew ? { ...d, knew: d.knew + 1 } : { ...d, again: d.again + 1 }))
    setShown(false)
    setQueue((q) => q!.slice(1))
  }

  return (
    <div className="deck-section">
      <div className="faint" style={{ textAlign: 'center', fontSize: '0.8rem', marginBottom: 10 }}>
        {queue.length} restante{queue.length > 1 ? 's' : ''}
      </div>
      <div className={`flashcard ${shown ? 'flipped' : ''}`} onClick={() => setShown(true)}>
        <div className="flashcard-q">{card.q}</div>
        {shown ? (
          <>
            <div className="flashcard-a">{card.a}</div>
            {card.source && <blockquote className="flashcard-src">{card.source}</blockquote>}
          </>
        ) : (
          <div className="faint" style={{ marginTop: 24 }}>Clique pour voir la réponse</div>
        )}
      </div>
      {shown && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn" onClick={() => answer(false)}>À revoir</button>
          <button className="btn primary" onClick={() => answer(true)}>Je savais</button>
        </div>
      )}
    </div>
  )
}

/* ---------------- Quiz (QCM) ---------------- */

function QuizTab({ deck }: { deck: Deck }) {
  const usable = deck.cards.filter((c) => c.a.length < 160)
  const [round, setRound] = useState(0)
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const order = useMemo(() => [...usable].sort(() => Math.random() - 0.5).slice(0, 10), [round, usable.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const card = order[i]
  const options = useMemo(() => {
    if (!card) return []
    const others = [...new Set(usable.filter((c) => c.id !== card.id && c.a !== card.a).map((c) => c.a))].sort(() => Math.random() - 0.5).slice(0, 3)
    return [...others, card.a].sort(() => Math.random() - 0.5)
  }, [card?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (usable.length < 4) return <p className="muted deck-section">Il faut au moins 4 cartes avec des réponses courtes pour créer un quiz (les mauvaises réponses viennent de tes autres cartes).</p>
  if (!card)
    return (
      <div className="deck-section review-start">
        <div className="hand" style={{ fontSize: '1.8rem' }}>Quiz terminé</div>
        <p className="muted" style={{ margin: '8px 0 18px' }}>{score} bonne{score > 1 ? 's' : ''} réponse{score > 1 ? 's' : ''} sur {order.length}.</p>
        <button className="btn primary" onClick={() => { setRound((r) => r + 1); setI(0); setScore(0); setPicked(null) }}>Un autre quiz</button>
      </div>
    )
  return (
    <div className="deck-section">
      <div className="faint" style={{ textAlign: 'center', fontSize: '0.8rem', marginBottom: 10 }}>
        Question {i + 1} / {order.length}
      </div>
      <div className="flashcard" style={{ cursor: 'default' }}>
        <div className="flashcard-q">{card.q}</div>
      </div>
      <div className="quiz-options">
        {options.map((o) => (
          <button
            key={o}
            className={`quiz-option ${picked ? (o === card.a ? 'right' : o === picked ? 'wrong' : '') : ''}`}
            disabled={!!picked}
            onClick={() => {
              setPicked(o)
              if (o === card.a) setScore((s) => s + 1)
            }}
          >
            {o}
          </button>
        ))}
      </div>
      {picked && (
        <>
          {card.source && <blockquote className="flashcard-src" style={{ maxWidth: 640, margin: '16px auto 0' }}>{card.source}</blockquote>}
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn primary" onClick={() => { setI(i + 1); setPicked(null) }}>Suivante</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------- Texte à trous ---------------- */

function ClozeTab({ deck }: { deck: Deck; notes: Note[] }) {
  const items = deck.cards.filter((c) => c.q.includes('_____'))
  const [i, setI] = useState(0)
  const [val, setVal] = useState('')
  const [checked, setChecked] = useState<boolean | null>(null)
  if (!items.length) return <p className="muted deck-section">Les textes à trous viennent des mots en gras de tes notes. Mets en gras les mots importants, puis « Proposer » dans l’onglet Cartes.</p>
  const it = items[i % items.length]
  const check = () => setChecked(normalizeAnswer(val) === normalizeAnswer(it.a))
  return (
    <div className="deck-section">
      <div className="flashcard" style={{ cursor: 'default' }}>
        <div className="flashcard-q" style={{ fontSize: '1.2rem' }}>
          {it.q.split('_____').map((part, k, arr) => (
            <span key={k}>
              {part}
              {k < arr.length - 1 && <span className="cloze-gap">{checked != null ? it.a : '?'}</span>}
            </span>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Le mot manquant" value={val} onChange={(e) => { setVal(e.target.value); setChecked(null) }} onKeyDown={(e) => e.key === 'Enter' && (checked == null ? check() : (setI(i + 1), setVal(''), setChecked(null)))} autoFocus />
        {checked == null ? (
          <button className="btn primary" onClick={check} disabled={!val.trim()}>Vérifier</button>
        ) : (
          <button className="btn primary" onClick={() => { setI(i + 1); setVal(''); setChecked(null) }}>Suivant</button>
        )}
      </div>
      {checked != null && <p className={`cloze-result ${checked ? 'ok' : ''}`}>{checked ? 'Exactement !' : `La réponse était « ${it.a} ».`}</p>}
    </div>
  )
}

/* ---------------- À approfondir ---------------- */

function DeepenTab({ deck, set }: { deck: Deck; set: (p: Partial<Deck>) => void }) {
  const [t, setT] = useState('')
  const add = () => {
    if (!t.trim()) return
    set({ deepen: [...deck.deepen, { id: uid(), text: t.trim(), done: false }] })
    setT('')
  }
  return (
    <div className="deck-section" style={{ maxWidth: 640 }}>
      <p className="muted" style={{ marginBottom: 12 }}>Ce que tu aimerais creuser un jour. Sans date, sans pression.</p>
      {deck.deepen.map((x) => (
        <div key={x.id} className={`task ${x.done ? 'done' : ''}`}>
          <button className={`task-check ${x.done ? 'on' : ''}`} aria-label="Marquer comme exploré" onClick={() => set({ deepen: deck.deepen.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)) })}>
            {x.done && <Icon name="check" size={12} strokeWidth={2.6} />}
          </button>
          <span className="task-title">{x.text}</span>
          <button className="btn ghost icon sm" aria-label="Retirer" onClick={() => set({ deepen: deck.deepen.filter((y) => y.id !== x.id) })}>
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <div className="task-add">
        <Icon name="plus" size={15} />
        <input value={t} placeholder="Une question, un sujet à creuser…" onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      </div>
    </div>
  )
}
