import type { CSSProperties, ReactNode } from 'react'
import { pickFiles, saveAsset, useAssetUrl } from '../db/assets'
import type { Cover as CoverT } from '../db/types'

/** Couvertures douces proposées par défaut. */
export const COVER_PRESETS: CoverT[] = [
  { kind: 'gradient', value: 'linear-gradient(135deg, #f6d9cf 0%, #f4e6c9 100%)' },
  { kind: 'gradient', value: 'linear-gradient(135deg, #e3ebdf 0%, #c9d8c5 100%)' },
  { kind: 'gradient', value: 'linear-gradient(135deg, #e8e3f3 0%, #f6dfe6 100%)' },
  { kind: 'gradient', value: 'linear-gradient(135deg, #dfe8ef 0%, #f1e9de 100%)' },
  { kind: 'gradient', value: 'linear-gradient(160deg, #f4e2d8 0%, #e6b9a2 100%)' },
  { kind: 'gradient', value: 'radial-gradient(circle at 30% 30%, #fff4e0 0%, #f2cfc4 60%, #d9a7a7 100%)' },
  { kind: 'gradient', value: 'linear-gradient(135deg, #2e2a26 0%, #5b4a52 100%)' },
  { kind: 'color', value: '#efe6d8' },
  { kind: 'color', value: '#e9d5cf' },
  { kind: 'color', value: '#d9e2d3' },
]

export function coverStyle(cover: CoverT | null | undefined, url: string | null): CSSProperties {
  if (!cover) return {}
  if (cover.kind === 'image') return url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: 'var(--surface-2)' }
  return { background: cover.value }
}

export function CoverView({
  cover,
  className,
  style,
  children,
}: {
  cover: CoverT | null | undefined
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const url = useAssetUrl(cover?.kind === 'image' ? cover.value : null)
  return (
    <div className={className} style={{ ...coverStyle(cover, url), ...style }}>
      {children}
    </div>
  )
}

/** Sélecteur de couverture : préréglages + image importée. */
export function CoverPicker({ value, onChange }: { value: CoverT | null | undefined; onChange: (c: CoverT | null) => void }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {COVER_PRESETS.map((c, i) => (
          <button
            key={i}
            onClick={() => onChange(c)}
            aria-label="Choisir cette couverture"
            style={{
              height: 48,
              borderRadius: 12,
              border: value?.value === c.value ? '2px solid var(--accent)' : '1px solid var(--line)',
              background: c.value,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn sm"
          onClick={async () => {
            const [f] = await pickFiles('image/*')
            if (f) onChange({ kind: 'image', value: await saveAsset(f) })
          }}
        >
          Importer une image
        </button>
        {value && (
          <button className="btn sm ghost" onClick={() => onChange(null)}>
            Retirer la couverture
          </button>
        )}
      </div>
    </div>
  )
}
