import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { removeAllLinks } from '../../db/links'
import type { Song } from '../../db/types'
import { Icon } from '../../components/Icon'
import { Menu, useUI } from '../../components/ui'
import { relative } from '../../lib/dates'
import { makeNote } from './PianoRoll'
import './synth.css'

export function newSong(partial: Partial<Song> = {}): Song {
  return { ...base(), title: '', bpm: 90, timeSig: [4, 4], measures: 8, notes: [], chords: [], annotations: [], sections: [], noteNames: 'fr', ...partial }
}

/** Un exemple pour découvrir l'atelier : « Au clair de la lune ». */
function exampleSong(): Song {
  const R = [60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60]
  const D = [1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 4]
  let t = 0
  const notes = R.map((p, i) => {
    const n = makeNote(p, t, D[i], 'R', p === 60 ? 1 : p === 62 ? 2 : 3)
    t += D[i]
    return n
  })
  const L = [
    [48, 0, 4],
    [43, 4, 4],
    [48, 8, 4],
    [43, 12, 2],
    [48, 14, 2],
  ].map(([p, s, d]) => makeNote(p, s, d, 'L', null))
  return newSong({
    title: 'Au clair de la lune (exemple)',
    bpm: 80,
    measures: 4,
    notes: [...notes, ...L],
    sections: [{ id: crypto.randomUUID(), measure: 0, name: 'Couplet' }],
    chords: [
      { id: crypto.randomUUID(), beat: 0, name: 'C' },
      { id: crypto.randomUUID(), beat: 4, name: 'G' },
      { id: crypto.randomUUID(), beat: 8, name: 'C' },
      { id: crypto.randomUUID(), beat: 12, name: 'G' },
    ],
  })
}

export function SongsPage() {
  const navigate = useNavigate()
  const { confirm } = useUI()
  const songs = useLiveQuery(() => db.songs.orderBy('updatedAt').reverse().toArray(), []) ?? []

  const create = async (s: Song) => {
    await db.songs.add(s)
    navigate(`/synthe/${s.id}`)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Atelier synthé</h1>
          <p className="sub">Écris tes morceaux note par note, suis-les au tempo, imprime-les.</p>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={() => create(exampleSong())}>
          <Icon name="music" size={16} /> Ouvrir un exemple
        </button>
        <button className="btn primary" onClick={() => create(newSong())}>
          <Icon name="plus" size={16} /> Nouveau morceau
        </button>
      </div>

      {songs.length === 0 ? (
        <div className="empty">
          <span className="hand">La première note</span>
          Crée un morceau, règle son tempo, puis ajoute les notes au clavier.
        </div>
      ) : (
        <div className="songs">
          {songs.map((s) => (
            <article key={s.id} className="card hoverable song-card" onClick={() => navigate(`/synthe/${s.id}`)}>
              <MiniRoll song={s} />
              <div className="row" style={{ padding: '12px 4px 2px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="song-card-title">{s.title || 'Sans titre'}</div>
                  <div className="faint" style={{ fontSize: '0.78rem' }}>
                    ♩ {s.bpm} · {s.timeSig.join('/')} · {s.measures} mesures · {s.lastPracticeAt ? `joué ${relative(s.lastPracticeAt)}` : `modifié ${relative(s.updatedAt)}`}
                  </div>
                </div>
                <Menu
                  trigger={
                    <button className="btn ghost icon sm" aria-label="Options">
                      <Icon name="more" size={16} />
                    </button>
                  }
                  items={[
                    { label: 'Dupliquer', icon: 'copy', onClick: () => db.songs.add({ ...s, ...base(), title: `${s.title || 'Sans titre'} (copie)` }) },
                    {
                      label: 'Supprimer',
                      icon: 'trash',
                      danger: true,
                      onClick: async () => {
                        if (!(await confirm({ title: 'Supprimer ce morceau ?', message: 'Il sera effacé définitivement.', confirmLabel: 'Supprimer définitivement', danger: true }))) return
                        await removeAllLinks('song', s.id)
                        await db.songs.delete(s.id)
                      },
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

/** Aperçu miniature façon piano roll. */
export function MiniRoll({ song, height = 90 }: { song: Song; height?: number }) {
  const total = song.measures * song.timeSig[0] * (4 / song.timeSig[1])
  const ps = song.notes.map((n) => n.pitch)
  const lo = ps.length ? Math.min(...ps) - 2 : 48
  const hi = ps.length ? Math.max(...ps) + 2 : 72
  return (
    <svg className="mini-roll" viewBox={`0 0 ${total} ${hi - lo + 1}`} preserveAspectRatio="none" style={{ height }}>
      {song.notes.map((n) => (
        <rect key={n.id} x={n.start} y={hi - n.pitch} width={Math.max(0.15, n.dur - 0.08)} height={0.8} rx={0.2} className={`hand-${n.hand}`} />
      ))}
    </svg>
  )
}
