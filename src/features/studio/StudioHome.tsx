import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { pickFiles } from '../../db/assets'
import { removeAllLinks } from '../../db/links'
import { Icon } from '../../components/Icon'
import { Menu, useUI } from '../../components/ui'
import { relative } from '../../lib/dates'
import { NewDocDialog } from './Dialogs'
import { createDoc, createDocFromImage } from './Studio'
import './studio.css'

export function StudioHome() {
  const navigate = useNavigate()
  const { confirm } = useUI()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(params.get('nouveau') === '1')
  const docs = useLiveQuery(() => db.graphics.orderBy('updatedAt').reverse().toArray(), []) ?? []
  useEffect(() => {
    if (params.get('nouveau') === '1') setCreating(true)
  }, [params])

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1>Studio graphique</h1>
          <p className="sub">Retouche et création, avec la disposition et les raccourcis de Photoshop.</p>
        </div>
        <span className="spacer" />
        <button
          className="btn"
          onClick={async () => {
            const [f] = await pickFiles('image/*')
            if (f) navigate(`/studio/${await createDocFromImage(f)}`)
          }}
        >
          <Icon name="image" size={16} /> Ouvrir une image
        </button>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Nouveau document
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="empty">
          <span className="hand">Une page blanche</span>
          <p>Crée un document ou ouvre une photo pour commencer.</p>
          <p className="faint" style={{ fontSize: '0.85rem', marginTop: 8 }}>
            Pour apprendre l’outil plume pas à pas, passe par l’atelier plume.
          </p>
        </div>
      ) : (
        <div className="studio-docs">
          {docs.map((d) => (
            <article key={d.id} className="card hoverable studio-doc" onClick={() => navigate(`/studio/${d.id}`)}>
              <DocThumb blob={d.thumb} />
              <div className="row" style={{ padding: '10px 4px 2px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="studio-doc-title">{d.title}</div>
                  <div className="faint" style={{ fontSize: '0.76rem' }}>
                    {d.width} × {d.height} · {relative(d.updatedAt)}
                  </div>
                </div>
                <Menu
                  trigger={
                    <button className="btn ghost icon sm" aria-label="Options">
                      <Icon name="more" size={16} />
                    </button>
                  }
                  items={[
                    { label: 'Dupliquer', icon: 'copy', onClick: () => db.graphics.add({ ...d, id: crypto.randomUUID(), title: `${d.title} copie`, createdAt: Date.now(), updatedAt: Date.now() }) },
                    {
                      label: 'Supprimer',
                      icon: 'trash',
                      danger: true,
                      onClick: async () => {
                        if (!(await confirm({ title: 'Supprimer ce document ?', message: 'Il sera effacé définitivement.', confirmLabel: 'Supprimer définitivement', danger: true }))) return
                        await removeAllLinks('moodboard', d.id)
                        await db.graphics.delete(d.id)
                      },
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <NewDocDialog
          onCancel={() => {
            setCreating(false)
            if (params.get('nouveau')) setParams({})
          }}
          onCreate={async (o) => {
            const id = await createDoc(o.title, o.w, o.h, o.bg)
            navigate(`/studio/${id}`)
          }}
        />
      )}
    </div>
  )
}

function DocThumb({ blob }: { blob: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return <div className="studio-thumb">{url ? <img src={url} alt="" /> : <Icon name="image" size={28} />}</div>
}
