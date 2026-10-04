import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { base, db } from '../../db/db'
import { useStudio } from './context'
import { activeLayer, useStore } from './store'
import { actions, replaceLayer } from './actions'
import { ctx2d, drawLayerContent, hexToHsv, hsvToHex, makeCanvas } from './engine'
import { BLENDS, type SLayer, type ShapeLayer, type TextLayer } from './types'
import { FONTS } from './context'
import { Icon } from '../../components/Icon'

const MaskIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="1" /><circle cx="12" cy="12" r="4" fill="currentColor" /></svg>
)

/* =========================================================
   Couleur (sélecteur TSV comme le panneau Couleur)
   ========================================================= */

export function ColorPanel() {
  const { ui, setUi } = useStudio()
  const [which, setWhich] = useState<'fg' | 'bg'>('fg')
  const color = which === 'fg' ? ui.fg : ui.bg
  const [h, s, v] = hexToHsv(color)
  const [hue, setHue] = useState(h)
  useEffect(() => {
    if (s > 0.02 && v > 0.02) setHue(h)
  }, [color]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (c: string) => setUi(which === 'fg' ? { fg: c } : { bg: c })
  const sv = useRef<HTMLDivElement>(null)
  const pick = (e: React.PointerEvent) => {
    const r = sv.current!.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    set(hsvToHex(hue, x, 1 - y))
  }
  return (
    <div className="pp-body">
      <div className="pp-color-top">
        <button className={`pp-swatch ${which === 'fg' ? 'on' : ''}`} style={{ background: ui.fg }} onClick={() => setWhich('fg')} title="Premier plan" />
        <button className={`pp-swatch ${which === 'bg' ? 'on' : ''}`} style={{ background: ui.bg }} onClick={() => setWhich('bg')} title="Arrière-plan" />
        <input className="pp-hex" value={color.toUpperCase()} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && set(e.target.value)} />
      </div>
      <div
        ref={sv}
        className="pp-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hue, 1, 1)})` }}
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => e.buttons && pick(e)}
      >
        <span className="pp-sv-dot" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
      </div>
      <input type="range" className="pp-hue" min={0} max={1} step={0.001} value={hue} onChange={(e) => {
        setHue(+e.target.value)
        set(hsvToHex(+e.target.value, s || 1, v || 1))
      }} />
    </div>
  )
}

/* =========================================================
   Nuancier (couleurs de base + palettes partagées de Minion)
   ========================================================= */

const BASE_SWATCHES = ['#000000', '#ffffff', '#5b534b', '#958b80', '#e5484d', '#f2994a', '#f2c94c', '#6fcf97', '#27ae60', '#2d9cdb', '#2f80ed', '#9b51e0', '#c98b8b', '#8fa58a', '#a397c4', '#c8805f', '#7f9db5', '#faf6ef']

export function SwatchesPanel() {
  const { ui, setUi, notify } = useStudio()
  const palettes = useLiveQuery(() => db.palettes.orderBy('updatedAt').reverse().toArray(), []) ?? []
  return (
    <div className="pp-body">
      <div className="pp-swatches">
        {BASE_SWATCHES.map((c) => (
          <button key={c} style={{ background: c }} title={`${c} — clic : premier plan · Alt + clic : arrière-plan`} onClick={(e) => setUi(e.altKey ? { bg: c } : { fg: c })} />
        ))}
      </div>
      {palettes.map((p) => (
        <div key={p.id} className="pp-palette">
          <span className="pp-palette-name">{p.name}</span>
          <div className="pp-swatches">
            {p.colors.map((c, i) => (
              <button key={i} style={{ background: c }} title={c} onClick={(e) => setUi(e.altKey ? { bg: c } : { fg: c })} />
            ))}
          </div>
        </div>
      ))}
      <button
        className="pp-btn"
        onClick={async () => {
          const last = palettes[0]
          if (last && last.name === 'Studio') await db.palettes.update(last.id, { colors: [...new Set([...last.colors, ui.fg])], updatedAt: Date.now() })
          else await db.palettes.add({ ...base(), name: 'Studio', colors: [ui.fg] })
          notify('Couleur ajoutée au nuancier partagé (aussi dans les moodboards)')
        }}
      >
        + Ajouter la couleur de premier plan
      </button>
    </div>
  )
}

/* =========================================================
   Propriétés du calque actif
   ========================================================= */

export function PropertiesPanel() {
  const { store } = useStudio()
  const doc = useStore(store)
  const l = activeLayer(doc)
  if (!l) return <div className="pp-body pp-faint">Aucun calque sélectionné.</div>
  const live = (patch: Partial<SLayer>) => store.replace(replaceLayer(store.state, { ...l, ...patch } as SLayer))
  const commit = (name: string, patch: Partial<SLayer>) => store.commit(name, replaceLayer(store.state, { ...l, ...patch } as SLayer))
  const m = l.matrix
  return (
    <div className="pp-body pp-props">
      <div className="pp-row">
        <span>X</span>
        <input type="number" value={Math.round(m[4])} onChange={(e) => commit('Déplacer', { matrix: [m[0], m[1], m[2], m[3], +e.target.value, m[5]] })} />
        <span>Y</span>
        <input type="number" value={Math.round(m[5])} onChange={(e) => commit('Déplacer', { matrix: [m[0], m[1], m[2], m[3], m[4], +e.target.value] })} />
      </div>
      {l.kind === 'text' && <TextProps l={l} live={live} commit={commit} />}
      {l.kind === 'shape' && <ShapeProps l={l} commit={commit} />}
      {l.kind === 'raster' && <p className="pp-faint">Calque de pixels · {l.canvas.width} × {l.canvas.height} px</p>}
      {l.mask && (
        <div className="pp-row">
          <label className="pp-check">
            <input type="checkbox" checked={l.maskEnabled} onChange={(e) => commit('Activer le masque', { maskEnabled: e.target.checked })} /> Masque actif
          </label>
          <button className="pp-btn sm" onClick={() => actions.removeMask(store)}>Supprimer le masque</button>
        </div>
      )}
    </div>
  )
}

function TextProps({ l, live, commit }: { l: TextLayer; live: (p: Partial<TextLayer>) => void; commit: (n: string, p: Partial<TextLayer>) => void }) {
  return (
    <>
      <select value={l.font} onChange={(e) => commit('Police', { font: e.target.value })} style={{ fontFamily: l.font }}>
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f.replace(' Variable', '')}
          </option>
        ))}
      </select>
      <div className="pp-row">
        <span>Corps</span>
        <input type="number" min={4} max={1000} value={l.size} onChange={(e) => commit('Corps', { size: Math.max(4, +e.target.value) })} />
        <input type="color" value={l.color} onChange={(e) => live({ color: e.target.value })} onBlur={(e) => commit('Couleur du texte', { color: e.target.value })} />
      </div>
      <div className="pp-row">
        <button className={`pp-tog ${l.bold ? 'on' : ''}`} onClick={() => commit('Gras', { bold: !l.bold })}><b>G</b></button>
        <button className={`pp-tog ${l.italic ? 'on' : ''}`} onClick={() => commit('Italique', { italic: !l.italic })}><i>I</i></button>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} className={`pp-tog ${l.align === a ? 'on' : ''}`} onClick={() => commit('Alignement', { align: a })}>{a === 'left' ? '⟸' : a === 'center' ? '⟺' : '⟹'}</button>
        ))}
      </div>
      <div className="pp-row">
        <span>Interligne</span>
        <input type="range" min={0.8} max={2.5} step={0.05} value={l.lineHeight} onChange={(e) => live({ lineHeight: +e.target.value })} onPointerUp={() => commit('Interligne', { lineHeight: l.lineHeight })} />
      </div>
    </>
  )
}

function ShapeProps({ l, commit }: { l: ShapeLayer; commit: (n: string, p: Partial<ShapeLayer>) => void }) {
  return (
    <>
      {l.shape !== 'path' && l.shape !== 'line' && (
        <div className="pp-row">
          <span>L</span>
          <input type="number" value={Math.round(l.w)} onChange={(e) => commit('Taille', { w: +e.target.value })} />
          <span>H</span>
          <input type="number" value={Math.round(l.h)} onChange={(e) => commit('Taille', { h: +e.target.value })} />
        </div>
      )}
      <div className="pp-row">
        <label className="pp-check">
          <input type="checkbox" checked={!!l.fill} onChange={(e) => commit('Fond', { fill: e.target.checked ? '#c98b8b' : null })} /> Fond
        </label>
        {l.fill && <input type="color" value={l.fill} onChange={(e) => commit('Fond', { fill: e.target.value })} />}
      </div>
      <div className="pp-row">
        <label className="pp-check">
          <input type="checkbox" checked={!!l.stroke} onChange={(e) => commit('Contour', { stroke: e.target.checked ? '#000000' : null })} /> Contour
        </label>
        {l.stroke && (
          <>
            <input type="color" value={l.stroke} onChange={(e) => commit('Contour', { stroke: e.target.value })} />
            <input type="number" min={0} max={200} value={l.strokeWidth} onChange={(e) => commit('Épaisseur', { strokeWidth: +e.target.value })} />
          </>
        )}
      </div>
      {l.shape === 'rect' && (
        <div className="pp-row">
          <span>Arrondi</span>
          <input type="number" min={0} value={l.radius} onChange={(e) => commit('Arrondi', { radius: +e.target.value })} />
        </div>
      )}
      {l.shape === 'polygon' && (
        <div className="pp-row">
          <span>Côtés</span>
          <input type="number" min={3} max={30} value={l.sides} onChange={(e) => commit('Côtés', { sides: Math.max(3, +e.target.value) })} />
        </div>
      )}
    </>
  )
}

/* =========================================================
   Calques
   ========================================================= */

export function LayersPanel() {
  const { store, notify } = useStudio()
  const doc = useStore(store)
  const act = activeLayer(doc)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  // affichage du haut vers le bas, avec indentation des groupes
  const rows: { l: SLayer; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    const kids = doc.layers.filter((l) => l.parentId === parentId)
    for (let i = kids.length - 1; i >= 0; i--) {
      const l = kids[i]
      rows.push({ l, depth })
      if (l.kind === 'group' && !l.collapsed) walk(l.id, depth + 1)
    }
  }
  walk(null, 0)

  const set = (name: string, l: SLayer, patch: Partial<SLayer>) => store.commit(name, replaceLayer(store.state, { ...l, ...patch } as SLayer))

  const onDrop = (e: DragEvent, target: SLayer) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/layer')
    setDragId(null)
    if (!id || id === target.id) return
    if (target.kind === 'group' && e.altKey === false && (e.nativeEvent as globalThis.DragEvent).offsetY > 8 && (e.nativeEvent as globalThis.DragEvent).offsetY < 24) {
      actions.reorder(store, id, null, target.id)
      return
    }
    // dépose au-dessus de la cible (dans l'ordre d'affichage)
    const idx = doc.layers.findIndex((x) => x.id === target.id)
    const above = doc.layers[idx + 1]
    actions.reorder(store, id, above && above.parentId === target.parentId ? above.id : null, target.parentId)
  }

  return (
    <div className="pp-layers">
      <div className="pp-layer-opts">
        <select
          value={act?.blend ?? 'source-over'}
          disabled={!act}
          onChange={(e) => act && set('Mode de fusion', act, { blend: e.target.value as SLayer['blend'] })}
          title="Mode de fusion"
        >
          {BLENDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <label title="Opacité">
          Opacité
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round((act?.opacity ?? 1) * 100)}
            disabled={!act}
            onChange={(e) => act && set('Opacité', act, { opacity: Math.min(1, Math.max(0, +e.target.value / 100)) })}
          />
          %
        </label>
      </div>
      <div className="pp-layer-opts">
        <span className="pp-faint">Verrou :</span>
        <button className={`pp-tog ${act?.locked ? 'on' : ''}`} disabled={!act} onClick={() => act && set(act.locked ? 'Déverrouiller' : 'Verrouiller', act, { locked: !act.locked })} title="Verrouiller tout">
          <Icon name="lock" size={13} />
        </button>
      </div>
      <div className="pp-layer-list">
        {rows.map(({ l, depth }) => (
          <div
            key={l.id}
            className={`pp-layer ${l.id === doc.activeId ? 'on' : ''} ${dragId === l.id ? 'dragging' : ''}`}
            style={{ paddingLeft: 6 + depth * 16 }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/layer', l.id)
              setDragId(l.id)
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, l)}
            onClick={() => store.replace({ ...store.state, activeId: l.id, editMask: false })}
            onDoubleClick={() => setRenaming(l.id)}
          >
            <button
              className="pp-eye"
              title={l.visible ? 'Masquer' : 'Afficher'}
              onClick={(e) => {
                e.stopPropagation()
                set(l.visible ? 'Masquer le calque' : 'Afficher le calque', l, { visible: !l.visible })
              }}
            >
              {l.visible ? <Icon name="eye" size={14} /> : null}
            </button>
            {l.kind === 'group' ? (
              <button className="pp-fold" onClick={(e) => { e.stopPropagation(); store.replace(replaceLayer(store.state, { ...l, collapsed: !l.collapsed })) }}>
                {l.collapsed ? '▸' : '▾'} <Icon name="folder" size={15} />
              </button>
            ) : (
              <Thumb
                l={l}
                doc={doc}
                onCtrlClick={() => actions.selectionFromLayer(store, l.id)}
                active={l.id === doc.activeId && !doc.editMask}
                onSelect={() => store.replace({ ...store.state, activeId: l.id, editMask: false })}
              />
            )}
            {l.mask && (
              <MaskThumb
                mask={l.mask}
                doc={doc}
                active={l.id === doc.activeId && doc.editMask}
                disabled={!l.maskEnabled}
                onSelect={() => store.replace({ ...store.state, activeId: l.id, editMask: true })}
                onShiftClick={() => set(l.maskEnabled ? 'Désactiver le masque' : 'Activer le masque', l, { maskEnabled: !l.maskEnabled })}
              />
            )}
            {renaming === l.id ? (
              <input
                className="pp-rename"
                autoFocus
                defaultValue={l.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  setRenaming(null)
                  if (e.target.value.trim() && e.target.value !== l.name) set('Renommer le calque', l, { name: e.target.value.trim() })
                }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <span className="pp-layer-name">
                {l.kind === 'text' && <b className="pp-kind">T</b>}
                {l.kind === 'shape' && <b className="pp-kind">◆</b>}
                {l.name}
              </span>
            )}
            {l.locked && <Icon name="lock" size={12} className="pp-lock" />}
          </div>
        ))}
      </div>
      <div className="pp-layer-bar">
        <button title="Grouper (Ctrl+G)" onClick={() => actions.group(store)}><Icon name="folder" size={16} /></button>
        <button
          title="Ajouter un masque de fusion"
          onClick={() => {
            if (!act) return
            if (act.mask) return notify('Ce calque a déjà un masque.')
            actions.addMask(store, !!doc.selection)
          }}
        >
          <MaskIcon />
        </button>
        <button title="Créer un calque (Ctrl+Maj+N)" onClick={() => actions.newLayer(store)}><Icon name="plus" size={16} /></button>
        <button title="Supprimer le calque" onClick={() => actions.remove(store)}><Icon name="trash" size={16} /></button>
      </div>
    </div>
  )
}

function Thumb({ l, doc, onCtrlClick, active, onSelect }: { l: SLayer; doc: { width: number; height: number }; onCtrlClick: () => void; active: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const r = Math.min(36 / doc.width, 36 / doc.height)
    c.width = Math.max(1, Math.round(doc.width * r))
    c.height = Math.max(1, Math.round(doc.height * r))
    const x = ctx2d(c)
    x.clearRect(0, 0, c.width, c.height)
    x.save()
    x.scale(r, r)
    drawLayerContent(x, l)
    x.restore()
  }, [l, doc.width, doc.height])
  return (
    <canvas
      ref={ref}
      className={`pp-thumb ${active ? 'on' : ''}`}
      title="Ctrl + clic : charger la sélection"
      onClick={(e) => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey) onCtrlClick()
        else onSelect()
      }}
    />
  )
}

function MaskThumb({ mask, doc, active, disabled, onSelect, onShiftClick }: { mask: HTMLCanvasElement; doc: { width: number; height: number }; active: boolean; disabled: boolean; onSelect: () => void; onShiftClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const r = Math.min(36 / doc.width, 36 / doc.height)
    c.width = Math.max(1, Math.round(doc.width * r))
    c.height = Math.max(1, Math.round(doc.height * r))
    const x = ctx2d(c)
    x.fillStyle = '#000'
    x.fillRect(0, 0, c.width, c.height)
    const tmp = makeCanvas(c.width, c.height)
    const t = ctx2d(tmp)
    t.drawImage(mask, 0, 0, c.width, c.height)
    t.globalCompositeOperation = 'source-in'
    t.fillStyle = '#fff'
    t.fillRect(0, 0, c.width, c.height)
    x.drawImage(tmp, 0, 0)
  }, [mask, doc.width, doc.height])
  return (
    <canvas
      ref={ref}
      className={`pp-thumb mask ${active ? 'on' : ''} ${disabled ? 'off' : ''}`}
      title="Masque de fusion · Maj + clic : activer / désactiver"
      onClick={(e) => {
        e.stopPropagation()
        if (e.shiftKey) onShiftClick()
        else onSelect()
      }}
    />
  )
}

/* =========================================================
   Historique
   ========================================================= */

export function HistoryPanel() {
  const { store } = useStudio()
  useStore(store)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [store.steps.length])
  return (
    <div className="pp-history" ref={list}>
      {store.steps.map((s, i) => (
        <button key={i} className={`pp-step ${i === store.index ? 'on' : ''} ${i > store.index ? 'future' : ''}`} onClick={() => store.goTo(i)}>
          {s.name}
        </button>
      ))}
    </div>
  )
}
