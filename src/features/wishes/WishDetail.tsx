import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { base, db } from '../../db/db'
import { link } from '../../db/links'
import { pickFiles, saveAsset, useAssetUrl } from '../../db/assets'
import { useSettings } from '../../db/settings'
import type { Wish } from '../../db/types'
import { Icon } from '../../components/Icon'
import { LinkedItems } from '../../components/Linked'
import { Modal, SaveStatus, useAutosave, useUI } from '../../components/ui'
import { textToDoc } from '../notes/api'
import { fmtDay, parseYmd, ymd } from '../../lib/dates'
import { WISH_EMOJIS, WISH_ORDER, WISH_STATES } from './meta'

/** Fiche d'une envie (édition, liens, transformation en projet, souvenir). */
export function WishDetail({ wish, groups, onClose }: { wish: Wish; groups: string[]; onClose: () => void }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const { confirm, toast } = useUI()
  const [d, setD] = useState<Wish>(wish)
  useEffect(() => setD(wish), [wish.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const state = useAutosave(d, (v) => db.wishes.put({ ...v, updatedAt: Date.now() }), 400)
  const set = (p: Partial<Wish>) => setD((x) => ({ ...x, ...p }))
  const img = useAssetUrl(d.imageId)

  const toProject = async () => {
    const p = { ...base(), title: d.title, intention: d.description, status: 'encours', order: await db.projects.count(), cover: null }
    await db.projects.add(p)
    await link('wish', d.id, 'project', p.id)
    set({ state: d.state === 'done' ? 'done' : 'doing' })
    toast('Projet créé. L’envie reste sur ton parchemin, reliée au projet.', { action: { label: 'Ouvrir', run: () => navigate(`/projets/${p.id}`) } })
  }

  const toJournal = async () => {
    const date = d.memory?.date || ymd()
    let entry = await db.journal.where('date').equals(date).first()
    const text = `✨ Envie accomplie : ${d.title}\n${d.memory?.text ?? ''}`.trim()
    if (!entry) {
      entry = { ...base(), date, content: textToDoc(text), text, highlights: [d.title], prides: [], answers: {}, photoIds: d.memory?.photoIds ?? [], mood: null }
      await db.journal.add(entry)
    } else {
      await db.journal.update(entry.id, { highlights: [...entry.highlights, d.title], photoIds: [...entry.photoIds, ...(d.memory?.photoIds ?? [])], updatedAt: Date.now() })
    }
    await link('wish', d.id, 'journal', entry.id)
    toast('Souvenir ajouté à ton journal', { action: { label: 'Voir', run: () => navigate(`/journal/${entry!.id}`) } })
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Effacer cette envie ?', message: 'Elle disparaîtra de ton parchemin. Cette action est définitive.', confirmLabel: 'Effacer', danger: true }))) return
    await db.wishes.delete(d.id)
    onClose()
  }

  const memory = d.memory ?? { text: '', photoIds: [], date: ymd() }

  return (
    <Modal
      open
      onClose={onClose}
      width={720}
      title={
        <span className="row" style={{ gap: 8 }}>
          <Icon name="scroll" size={18} style={{ color: 'var(--accent-deep)' }} /> Une envie
        </span>
      }
      footer={
        <>
          <button className="btn ghost danger" onClick={remove} style={{ marginRight: 'auto' }}>
            <Icon name="trash" size={15} /> Effacer
          </button>
          <SaveStatus state={state} />
          <button className="btn primary" onClick={onClose}>
            Fermer
          </button>
        </>
      }
    >
      <div className="wish-detail">
        <div className="wish-detail-main">
          <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <select className="wish-emoji-select" value={d.emoji ?? ''} onChange={(e) => set({ emoji: e.target.value || undefined })} aria-label="Symbole">
              <option value="">✦</option>
              {WISH_EMOJIS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <input className="title-input" style={{ fontSize: '1.8rem' }} placeholder="Ce dont j’ai envie…" value={d.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!d.title} />
          </div>

          <textarea className="textarea" style={{ marginTop: 14 }} placeholder="Pourquoi ça me fait envie, à quoi ça ressemblerait…" value={d.description} onChange={(e) => set({ description: e.target.value })} />

          <div className="label" style={{ marginTop: 16 }}>
            État
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {WISH_ORDER.map((s) => (
              <button key={s} className={`chip ${d.state === s ? 'active' : 'neutral'}`} style={d.state === s ? { background: WISH_STATES[s].color } : undefined} onClick={() => set({ state: s })}>
                {WISH_STATES[s].label}
              </button>
            ))}
          </div>

          {d.state === 'done' && (
            <div className="wish-memory">
              <div className="hand" style={{ fontSize: '1.4rem' }}>
                Le souvenir
              </div>
              <div className="row" style={{ margin: '8px 0' }}>
                <input type="date" className="input" style={{ width: 170 }} value={memory.date ?? ''} onChange={(e) => set({ memory: { ...memory, date: e.target.value } })} />
                {memory.date && <span className="faint">{fmtDay(parseYmd(memory.date))}</span>}
              </div>
              <textarea className="textarea" placeholder="Comment c’était ? Ce que je veux garder…" value={memory.text} onChange={(e) => set({ memory: { ...memory, text: e.target.value } })} />
              <div className="wish-photos">
                {memory.photoIds.map((p) => (
                  <Photo key={p} id={p} onRemove={() => set({ memory: { ...memory, photoIds: memory.photoIds.filter((x) => x !== p) } })} />
                ))}
                <button
                  className="wish-photo-add"
                  onClick={async () => {
                    const files = await pickFiles('image/*', true)
                    const ids = await Promise.all(files.map(saveAsset))
                    set({ memory: { ...memory, photoIds: [...memory.photoIds, ...ids] } })
                  }}
                >
                  <Icon name="plus" size={18} /> Photos
                </button>
              </div>
              <button className="btn sm" style={{ marginTop: 10 }} onClick={toJournal}>
                <Icon name="feather" size={14} /> Ajouter ce souvenir à mon journal
              </button>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <LinkedItems type="wish" id={d.id} title="Notes, inspirations, projets" />
          </div>
        </div>

        <aside className="wish-detail-side">
          <div className="wish-image" onClick={async () => {
            const [f] = await pickFiles('image/*')
            if (f) set({ imageId: await saveAsset(f) })
          }}>
            {img ? <img src={img} alt="" /> : <span className="faint"><Icon name="image" size={20} /><br />Ajouter une image</span>}
          </div>
          {img && (
            <button className="btn ghost sm" onClick={() => set({ imageId: null })}>
              Retirer l’image
            </button>
          )}

          <label className="label" style={{ marginTop: 14 }}>
            Catégorie
          </label>
          <select className="select" value={d.category} onChange={(e) => set({ category: e.target.value })}>
            {[...new Set([...settings.wishCategories, d.category])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <label className="label" style={{ marginTop: 14 }}>
            Groupe sur le parchemin
          </label>
          <input className="input" list="wish-groups" placeholder="Ex. Cette année, Un jour peut-être…" value={d.group ?? ''} onChange={(e) => set({ group: e.target.value })} />
          <datalist id="wish-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>

          <label className="label" style={{ marginTop: 14 }}>
            Présentation
          </label>
          <div className="seg">
            {(['carte', 'note', 'polaroid'] as const).map((s) => (
              <button key={s} className={(d.style ?? 'carte') === s ? 'on' : ''} onClick={() => set({ style: s })}>
                {s === 'carte' ? 'Carte' : s === 'note' ? 'Mot' : 'Polaroïd'}
              </button>
            ))}
          </div>

          <label className="label" style={{ marginTop: 14 }}>
            Date (facultative)
          </label>
          <input type="date" className="input" value={d.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />

          <button className="btn" style={{ marginTop: 18, width: '100%' }} onClick={toProject}>
            <Icon name="kanban" size={15} /> En faire un projet
          </button>
        </aside>
      </div>
    </Modal>
  )
}

function Photo({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = useAssetUrl(id)
  return (
    <div className="wish-photo">
      {url && <img src={url} alt="" />}
      <button className="wish-photo-x" onClick={onRemove} aria-label="Retirer la photo">
        <Icon name="x" size={12} />
      </button>
    </div>
  )
}
