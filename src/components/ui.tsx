import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import './ui.css'

/* ---------------- Modal ---------------- */

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ open, onClose, title, children, footer, width = 520 }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal>
        {title && (
          <div className="modal-head">
            <h3>{title}</h3>
            <button className="btn ghost icon sm" onClick={onClose} aria-label="Fermer">
              <Icon name="x" />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- Confirmation & toasts ---------------- */

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
  action?: { label: string; run: () => void }
}

interface UICtx {
  confirm: (o: ConfirmOptions) => Promise<boolean>
  toast: (text: string, opts?: { kind?: 'info' | 'error'; action?: Toast['action'] }) => void
}

const Ctx = createContext<UICtx | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })),
    [],
  )
  const toast = useCallback<UICtx['toast']>((text, opts) => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, text, kind: opts?.kind ?? 'info', action: opts?.action }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.action ? 6000 : 3200)
  }, [])

  const close = (v: boolean) => {
    pending?.resolve(v)
    setPending(null)
  }

  return (
    <Ctx.Provider value={{ confirm, toast }}>
      {children}
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title}
        width={420}
        footer={
          <>
            <button className="btn ghost" onClick={() => close(false)}>
              Annuler
            </button>
            <button className={`btn ${pending?.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)} autoFocus>
              {pending?.confirmLabel ?? 'Confirmer'}
            </button>
          </>
        }
      >
        {pending?.message && <p className="muted">{pending.message}</p>}
      </Modal>
      {createPortal(
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              <span>{t.text}</span>
              {t.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.action!.run()
                    setToasts((all) => all.filter((x) => x.id !== t.id))
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function useUI() {
  const c = useContext(Ctx)
  if (!c) throw new Error('UIProvider manquant')
  return c
}

/* ---------------- État de sauvegarde ---------------- */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SaveStatus({ state }: { state: SaveState }) {
  const label = { idle: '', saving: 'Enregistrement…', saved: 'Enregistré', error: 'Échec de l’enregistrement' }[state]
  return (
    <span className={`save-status ${state}`} aria-live="polite">
      {state === 'saved' && <Icon name="check" size={14} />}
      {label}
    </span>
  )
}

/**
 * Sauvegarde automatique : appelle `save` après une pause de saisie
 * et expose l'état visible.
 */
export function useAutosave<T>(value: T, save: (v: T) => Promise<unknown>, delay = 600) {
  const [state, setState] = useState<SaveState>('idle')
  const first = useRef(true)
  const saveRef = useRef(save)
  saveRef.current = save
  const latest = useRef(value)
  latest.current = value
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    dirty.current = true
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        await saveRef.current(latest.current)
        dirty.current = false
        setState('saved')
      } catch (e) {
        console.error(e)
        setState('error')
      }
    }, delay)
  }, [value, delay])

  // Sauvegarde immédiate si on quitte l'écran avant la fin du délai
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (dirty.current) void saveRef.current(latest.current)
    },
    [],
  )

  return state
}

/* ---------------- Menu contextuel simple ---------------- */

export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  trigger: ReactNode
  items: ({ label: string; icon?: string; danger?: boolean; onClick: () => void } | null)[]
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      <span
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        {trigger}
      </span>
      {open && (
        <div className={`menu ${align}`} onClick={(e) => e.stopPropagation()}>
          {items.filter(Boolean).map((it, i) => (
            <button
              key={i}
              className={`menu-item ${it!.danger ? 'danger' : ''}`}
              onClick={() => {
                setOpen(false)
                it!.onClick()
              }}
            >
              {it!.icon && <Icon name={it!.icon} size={16} />}
              {it!.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
