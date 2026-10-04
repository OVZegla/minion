import { useAssetUrl } from '../../db/assets'
import type { MoodItem } from '../../db/types'

export const FONT: Record<NonNullable<MoodItem['font']>, string> = {
  display: 'Fraunces Variable, Georgia, serif',
  body: 'Inter Variable, Segoe UI, sans-serif',
  hand: 'Caveat, cursive',
}

export function shapePath(shape: MoodItem['shape'], w: number, h: number) {
  switch (shape) {
    case 'circle':
      return `M ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${w / 2 - 0.01} 0 Z`
    case 'arch':
      return `M 0 ${h} L 0 ${w / 2} A ${w / 2} ${w / 2} 0 0 1 ${w} ${w / 2} L ${w} ${h} Z`
    case 'blob':
      return `M ${w * 0.5} 0 C ${w * 0.85} 0 ${w} ${h * 0.2} ${w} ${h * 0.5} C ${w} ${h * 0.85} ${w * 0.75} ${h} ${w * 0.45} ${h} C ${w * 0.15} ${h} 0 ${h * 0.75} 0 ${h * 0.45} C 0 ${h * 0.15} ${w * 0.2} 0 ${w * 0.5} 0 Z`
    default:
      return `M 0 0 H ${w} V ${h} H 0 Z`
  }
}

/** Rendu SVG d'un élément de moodboard (dans son repère local). */
export function MoodItemView({ item }: { item: MoodItem }) {
  const { x, y, w, h, rotation } = item
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation} ${w / 2} ${h / 2})`}>
      <ItemBody item={item} />
    </g>
  )
}

function ItemBody({ item }: { item: MoodItem }) {
  const { w, h } = item
  switch (item.kind) {
    case 'image':
      return <ImageBody item={item} />
    case 'text':
      return (
        <foreignObject width={w} height={h}>
          <div
            style={{
              width: '100%',
              height: '100%',
              fontFamily: FONT[item.font ?? 'display'],
              fontSize: item.fontSize ?? 32,
              color: item.color ?? '#2e2a26',
              lineHeight: 1.2,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflow: 'hidden',
            }}
          >
            {item.text}
          </div>
        </foreignObject>
      )
    case 'note':
      return (
        <>
          <rect width={w} height={h} rx={6} fill={item.fill ?? '#fbf1c7'} style={{ filter: 'drop-shadow(0 4px 8px rgba(80,60,40,.12))' }} />
          <foreignObject x={14} y={12} width={Math.max(0, w - 28)} height={Math.max(0, h - 24)}>
            <div style={{ fontFamily: FONT.hand, fontSize: item.fontSize ?? 26, color: item.color ?? '#5b4a3a', lineHeight: 1.15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {item.text}
            </div>
          </foreignObject>
        </>
      )
    case 'palette': {
      const colors = item.colors?.length ? item.colors : ['#eee']
      const cw = w / colors.length
      return (
        <>
          <rect width={w} height={h} rx={14} fill="#fffdf9" style={{ filter: 'drop-shadow(0 4px 12px rgba(80,60,40,.10))' }} />
          {colors.map((c, i) => (
            <g key={i}>
              <rect x={i * cw + 6} y={6} width={cw - 12 + (i === colors.length - 1 ? 0 : 6)} height={h - 40} rx={8} fill={c} />
              <text x={i * cw + cw / 2} y={h - 14} textAnchor="middle" fontSize={12} fontFamily={FONT.body} fill="#958b80">
                {c.toUpperCase()}
              </text>
            </g>
          ))}
        </>
      )
    }
    case 'link':
      return (
        <>
          <rect width={w} height={h} rx={14} fill="#fffdf9" stroke="#e9e0d2" style={{ filter: 'drop-shadow(0 4px 12px rgba(80,60,40,.08))' }} />
          <foreignObject x={16} y={12} width={Math.max(0, w - 32)} height={Math.max(0, h - 24)}>
            <div style={{ fontFamily: FONT.body, fontSize: 14, color: '#2e2a26', lineHeight: 1.35, overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.label || 'Lien'}</div>
              <div style={{ color: '#a8676a', wordBreak: 'break-all', fontSize: 12 }}>{item.url}</div>
            </div>
          </foreignObject>
        </>
      )
    case 'shape':
      return <path d={shapePath(item.shape, w, h)} fill={item.fill ?? '#f3e1df'} />
    case 'swatch':
      return <SwatchBody item={item} />
  }
}

function ImageBody({ item }: { item: MoodItem }) {
  const url = useAssetUrl(item.imageId)
  return url ? (
    <image href={url} width={item.w} height={item.h} preserveAspectRatio="xMidYMid slice" />
  ) : (
    <rect width={item.w} height={item.h} fill="#f3ece0" />
  )
}

function SwatchBody({ item }: { item: MoodItem }) {
  const url = useAssetUrl(item.imageId)
  const { w, h } = item
  const id = `sw-${item.id}`
  return (
    <>
      <rect width={w} height={h} rx={10} fill="#fffdf9" style={{ filter: 'drop-shadow(0 4px 10px rgba(80,60,40,.12))' }} />
      <clipPath id={id}>
        <rect x={8} y={8} width={w - 16} height={h - 40} rx={6} />
      </clipPath>
      {url ? (
        <image href={url} x={8} y={8} width={w - 16} height={h - 40} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
      ) : (
        <rect x={8} y={8} width={w - 16} height={h - 40} rx={6} fill={item.fill ?? '#d8c3a5'} />
      )}
      <text x={12} y={h - 13} fontSize={13} fontFamily={FONT.body} fill="#5b534b">
        {item.label || 'Matière'}
      </text>
    </>
  )
}
