import { useMemo } from 'react'
import type { Moodboard } from '../../db/types'
import { MoodItemView } from './MoodItemView'

/** Aperçu miniature (non interactif) d'un moodboard. */
export function MoodboardThumb({ board, height = 150 }: { board: Moodboard; height?: number }) {
  const bounds = useMemo(() => {
    if (!board.items.length) return { x: 0, y: 0, w: 1200, h: 800 }
    const xs = board.items.flatMap((i) => [i.x, i.x + i.w])
    const ys = board.items.flatMap((i) => [i.y, i.y + i.h])
    const x = Math.min(...xs) - 40
    const y = Math.min(...ys) - 40
    return { x, y, w: Math.max(...xs) + 40 - x, h: Math.max(...ys) + 40 - y }
  }, [board.items])

  return (
    <div className="mb-thumb" style={{ height, background: board.background, borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
      <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
        {[...board.items]
          .sort((a, b) => a.z - b.z)
          .map((it) => (
            <MoodItemView key={it.id} item={it} />
          ))}
      </svg>
    </div>
  )
}
