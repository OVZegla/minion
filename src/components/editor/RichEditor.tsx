import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { AssetImage } from './AssetImage'
import { pickFiles, saveAsset } from '../../db/assets'
import { Icon } from '../Icon'
import { Modal } from '../ui'
import { LinkPicker } from '../Linked'
import { ENTITY, type EntitySummary } from '../../db/entities'
import './editor.css'

interface Props {
  content: unknown | null
  onChange: (json: unknown, text: string) => void
  placeholder?: string
  /** appelé quand elle insère un lien vers un autre contenu */
  onLinkContent?: (e: EntitySummary) => void
  minimal?: boolean
}

/** Éditeur riche : titres, listes, cases, citations, images, tableaux, liens. */
export function RichEditor({ content, onChange, placeholder = 'Écris ici…', onLinkContent, minimal = false }: Props) {
  const navigate = useNavigate()
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      AssetImage,
      Placeholder.configure({ placeholder }),
    ],
    content: (content as object) ?? '',
    onUpdate: ({ editor }) => onChange(editor.getJSON(), editor.getText({ blockSeparator: '\n' })),
    editorProps: {
      attributes: { class: 'prose' },
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement).closest('a')
        if (!a) return false
        const href = a.getAttribute('href') ?? ''
        if (href.startsWith('#/')) {
          navigate(href.slice(1))
          return true
        }
        if (event.ctrlKey || event.metaKey) {
          window.open(href, '_blank', 'noopener')
          return true
        }
        return false
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        files.forEach(async (f) => {
          const id = await saveAsset(f)
          const node = view.state.schema.nodes.image.create({ assetId: id })
          view.dispatch(view.state.tr.insert(pos ?? view.state.selection.from, node))
        })
        return true
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        files.forEach(async (f) => {
          const id = await saveAsset(f)
          view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ assetId: id })))
        })
        return true
      },
    },
  })

  return (
    <div className="rich">
      {editor && <Toolbar editor={editor} onLinkContent={onLinkContent} minimal={minimal} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor, onLinkContent, minimal }: { editor: Editor; onLinkContent?: (e: EntitySummary) => void; minimal: boolean }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [contentLink, setContentLink] = useState(false)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      table: e.isActive('table'),
    }),
  })
  const c = () => editor.chain().focus()

  const B = ({ on, label, onClick, children }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" className={`tb ${on ? 'on' : ''}`} title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )

  return (
    <div className="toolbar no-print">
      {!minimal && (
        <>
          <B on={s.h1} label="Titre" onClick={() => c().toggleHeading({ level: 1 }).run()}>
            <b>T1</b>
          </B>
          <B on={s.h2} label="Sous-titre" onClick={() => c().toggleHeading({ level: 2 }).run()}>
            <b>T2</b>
          </B>
          <B on={s.h3} label="Petit titre" onClick={() => c().toggleHeading({ level: 3 }).run()}>
            <b>T3</b>
          </B>
          <span className="tb-sep" />
        </>
      )}
      <B on={s.bold} label="Gras (Ctrl+B)" onClick={() => c().toggleBold().run()}>
        <b>G</b>
      </B>
      <B on={s.italic} label="Italique (Ctrl+I)" onClick={() => c().toggleItalic().run()}>
        <i style={{ fontFamily: 'var(--font-display)' }}>I</i>
      </B>
      <B on={s.underline} label="Souligné (Ctrl+U)" onClick={() => c().toggleUnderline().run()}>
        <u>S</u>
      </B>
      <B on={s.strike} label="Barré" onClick={() => c().toggleStrike().run()}>
        <s>B</s>
      </B>
      <span className="tb-sep" />
      <B on={s.bullet} label="Liste à puces" onClick={() => c().toggleBulletList().run()}>
        <Icon name="list" size={16} />
      </B>
      <B on={s.ordered} label="Liste numérotée" onClick={() => c().toggleOrderedList().run()}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>1.</span>
      </B>
      <B on={s.task} label="Cases à cocher" onClick={() => c().toggleTaskList().run()}>
        <Icon name="check" size={16} />
      </B>
      <B on={s.quote} label="Citation" onClick={() => c().toggleBlockquote().run()}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1 }}>“</span>
      </B>
      <span className="tb-sep" />
      <B on={s.link} label="Lien web" onClick={() => (s.link ? c().unsetLink().run() : setLinkOpen(true))}>
        <Icon name="link" size={16} />
      </B>
      {onLinkContent && (
        <B label="Lier une note ou un contenu" onClick={() => setContentLink(true)}>
          <Icon name="book" size={16} />
        </B>
      )}
      <B
        label="Image"
        onClick={async () => {
          const files = await pickFiles('image/*', true)
          for (const f of files) {
            const id = await saveAsset(f)
            editor.chain().focus().insertContent({ type: 'image', attrs: { assetId: id } }).run()
          }
        }}
      >
        <Icon name="image" size={16} />
      </B>
      {!minimal && (
        <B label="Tableau" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Icon name="grid" size={16} />
        </B>
      )}
      {s.table && (
        <>
          <span className="tb-sep" />
          <button type="button" className="tb text" onClick={() => c().addRowAfter().run()}>
            + ligne
          </button>
          <button type="button" className="tb text" onClick={() => c().addColumnAfter().run()}>
            + colonne
          </button>
          <button type="button" className="tb text" onClick={() => c().deleteRow().run()}>
            − ligne
          </button>
          <button type="button" className="tb text" onClick={() => c().deleteColumn().run()}>
            − colonne
          </button>
          <button type="button" className="tb text" onClick={() => c().deleteTable().run()}>
            Suppr. tableau
          </button>
        </>
      )}
      <span className="spacer" />
      <B label="Annuler (Ctrl+Z)" onClick={() => c().undo().run()}>
        <Icon name="undo" size={16} />
      </B>
      <B label="Rétablir (Ctrl+Y)" onClick={() => c().redo().run()}>
        <Icon name="redo" size={16} />
      </B>

      <WebLinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onSave={(url, label) => {
          const href = /^[a-z]+:/i.test(url) ? url : `https://${url}`
          if (editor.state.selection.empty) c().insertContent({ type: 'text', text: label || url, marks: [{ type: 'link', attrs: { href } }] }).run()
          else c().extendMarkRange('link').setLink({ href }).run()
        }}
      />
      {onLinkContent && (
        <LinkPicker
          open={contentLink}
          onClose={() => setContentLink(false)}
          title="Lier un contenu"
          onPick={(e) => {
            const href = '#' + ENTITY[e.type].route(e.id)
            if (editor.state.selection.empty) c().insertContent([{ type: 'text', text: e.title, marks: [{ type: 'link', attrs: { href } }] }, { type: 'text', text: ' ' }]).run()
            else c().extendMarkRange('link').setLink({ href }).run()
            onLinkContent(e)
          }}
        />
      )}
    </div>
  )
}

function WebLinkModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (url: string, label: string) => void }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (open) {
      setUrl('')
      setLabel('')
    }
  }, [open])
  const save = () => {
    if (!url.trim()) return
    onSave(url.trim(), label.trim())
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter un lien"
      width={440}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save} disabled={!url.trim()}>
            Ajouter
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label">Adresse</label>
        <input className="input" autoFocus placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <div className="field">
        <label className="label">Texte affiché (facultatif)</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
    </Modal>
  )
}
