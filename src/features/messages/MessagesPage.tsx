import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { useSettings } from '../../db/settings'
import { Mascot } from '../../components/Mascot'
import { LETTER_KEY } from '../letter/LetterPage'
import { BIRTHDAY_KEY } from '../birthday/Birthday'
import './messages.css'

/** Rejoue la surprise d'anniversaire (affichée par App). */
export const replayBirthday = () => window.dispatchEvent(new CustomEvent('minion:anniversaire'))

/** Nombre de messages pas encore ouverts (pour la pastille du menu). */
export function useUnreadMessages() {
  return (
    useLiveQuery(async () => {
      const [l, b] = await Promise.all([db.kv.get(LETTER_KEY), db.kv.get(BIRTHDAY_KEY)])
      return (l ? 0 : 1) + (b ? 0 : 1)
    }, []) ?? 0
  )
}

const when = (t: unknown) =>
  typeof t === 'number' ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' à ' + new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null

export function MessagesPage() {
  const navigate = useNavigate()
  const settings = useSettings()
  const seen = useLiveQuery(async () => {
    const [l, b] = await Promise.all([db.kv.get(LETTER_KEY), db.kv.get(BIRTHDAY_KEY)])
    return { letter: l?.value, birthday: b?.value }
  }, [])

  const messages = [
    {
      id: 'letter',
      from: 'Ton M',
      avatar: <span className="msg-seal">M</span>,
      opened: seen?.letter,
      title: 'Une lettre pour toi',
      text: 'Une lettre scellée à la cire, avec un bouquet de roses. Minion se charge de te l’apporter.',
      art: '💌',
      action: 'Ouvrir la lettre',
      go: () => navigate('/lettre'),
    },
    {
      id: 'birthday',
      from: 'Minion',
      avatar: <Mascot size={34} />,
      opened: seen?.birthday,
      title: `Joyeux anniversaire, ${settings.name || 'toi'} !`,
      text: 'Des bougies à souffler, un cadeau à ouvrir… et ton studio de musique à visiter.',
      art: '🎂',
      action: 'Revoir la surprise',
      go: replayBirthday,
    },
  ]

  return (
    <div className="page msg-page">
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p className="sub">Les petits mots qu’on t’a laissés. Tu peux les rouvrir quand tu veux.</p>
        </div>
      </div>

      <div className="msg-thread">
        {messages.map((m, i) => (
          <div key={m.id} className={`msg ${m.opened ? '' : 'unread'}`} style={{ ['--i' as string]: i }}>
            <div className="msg-avatar">{m.avatar}</div>
            <div className="msg-body">
              <div className="msg-meta">
                <b>{m.from}</b>
                <span>{m.opened ? `Ouvert le ${when(m.opened)}` : 'Nouveau'}</span>
              </div>
              <button className="msg-bubble" onClick={m.go}>
                <span className="msg-art" aria-hidden>
                  {m.art}
                </span>
                <span className="msg-content">
                  <b>{m.title}</b>
                  <span>{m.text}</span>
                  <span className="msg-action">{m.action} →</span>
                </span>
                {!m.opened && <span className="msg-dot" aria-label="Pas encore ouvert" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
