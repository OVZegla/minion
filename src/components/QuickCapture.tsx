import { useEffect, useRef, useState } from 'react'
import { base, db } from '../db/db'
import { captureIdea } from '../features/notes/api'
import { Modal, useUI } from './ui'

type Dest = 'note' | 'thought' | 'wish' | 'task'

const DESTS: { id: Dest; label: string; hint: string }[] = [
  { id: 'note', label: 'Idée', hint: 'Va dans ta boîte d’entrée, à classer plus tard.' },
  { id: 'thought', label: 'Pensée', hint: 'Déposée dans « Pensées à plat ».' },
  { id: 'wish', label: 'Envie', hint: 'Inscrite sur ton parchemin, « Un jour ».' },
  { id: 'task', label: 'Tâche', hint: 'Une petite chose à faire, sans date.' },
]

/** Capture en quelques secondes, depuis n'importe où (Ctrl+Maj+I). */
export function QuickCapture({ open, onClose, initialDest = 'note' }: { open: boolean; onClose: () => void; initialDest?: Dest }) {
  const [text, setText] = useState('')
  const [dest, setDest] = useState<Dest>(initialDest)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { toast } = useUI()

  useEffect(() => {
    if (open) {
      setDest(initialDest)
      window.setTimeout(() => ref.current?.focus(), 50)
    }
  }, [open, initialDest])

  const save = async () => {
    const t = text.trim()
    if (!t) return
    try {
      await captureTo(dest, t)
      setText('')
      onClose()
      toast({ note: 'Idée notée dans ta boîte d’entrée', thought: 'Pensée déposée', wish: 'Envie inscrite sur ton parchemin', task: 'Tâche ajoutée' }[dest])
    } catch (e) {
      console.error(e)
      toast('Impossible d’enregistrer pour le moment. Réessaie dans un instant.', { kind: 'error' })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Noter quelque chose"
      footer={
        <>
          <span className="faint" style={{ fontSize: '0.8rem', marginRight: 'auto', alignSelf: 'center' }}>
            Ctrl + Entrée pour enregistrer
          </span>
          <button className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save} disabled={!text.trim()}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="seg" style={{ marginBottom: 12 }}>
        {DESTS.map((d) => (
          <button key={d.id} className={dest === d.id ? 'on' : ''} onClick={() => setDest(d.id)}>
            {d.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        className="textarea"
        style={{ minHeight: 130, fontSize: '1.02rem' }}
        placeholder="Ce qui te passe par la tête…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            save()
          }
        }}
      />
      <p className="faint" style={{ fontSize: '0.82rem', marginTop: 8 }}>
        {DESTS.find((d) => d.id === dest)!.hint}
      </p>
    </Modal>
  )
}

export async function captureTo(dest: Dest, t: string) {
  if (dest === 'note') return captureIdea(t)
  if (dest === 'thought') return db.thoughts.add({ ...base(), text: t, group: null })
  if (dest === 'wish') {
    const count = await db.wishes.count()
    return db.wishes.add({
      ...base(),
      title: t.split('\n')[0],
      description: t.split('\n').slice(1).join('\n'),
      category: 'Rêve',
      state: 'someday',
      order: count,
    })
  }
  const count = await db.tasks.count()
  return db.tasks.add({ ...base(), title: t, done: false, date: null, projectId: null, order: count })
}
