import { isBlack, noteName } from './music'

export type KeyMark = 'now' | 'next' | 'sel' | 'R' | 'L'

/** Clavier visuel : saisie (clic) et affichage des repères. */
export function Keyboard({
  lo,
  hi,
  marks,
  onPress,
  lang = 'fr',
  showNames = 'c',
  height = 120,
  fingers,
}: {
  lo: number
  hi: number
  marks?: Map<number, KeyMark>
  onPress?: (midi: number) => void
  lang?: 'fr' | 'en'
  showNames?: 'none' | 'c' | 'white' | 'marked'
  height?: number
  fingers?: Map<number, number>
}) {
  const whites: number[] = []
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m)
  const ww = 100 / whites.length
  const whiteIndex = (m: number) => whites.indexOf(m)

  return (
    <div className="kb" style={{ height }} role="group" aria-label="Clavier">
      {whites.map((m, i) => {
        const mark = marks?.get(m)
        const label = showNames === 'white' || (showNames === 'c' && m % 12 === 0) || (showNames === 'marked' && mark)
        return (
          <button
            key={m}
            type="button"
            className={`kb-w ${mark ? `mk-${mark}` : ''}`}
            style={{ left: `${i * ww}%`, width: `${ww}%` }}
            onPointerDown={(e) => {
              e.preventDefault()
              onPress?.(m)
            }}
            tabIndex={-1}
            aria-label={noteName(m, lang)}
          >
            {fingers?.get(m) && <span className="kb-finger">{fingers.get(m)}</span>}
            {label && <span className="kb-name">{noteName(m, lang, m % 12 === 0 || showNames !== 'white')}</span>}
          </button>
        )
      })}
      {Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
        .filter(isBlack)
        .map((m) => {
          const left = (whiteIndex(m - 1) + 1) * ww - ww * 0.3
          const mark = marks?.get(m)
          return (
            <button
              key={m}
              type="button"
              className={`kb-b ${mark ? `mk-${mark}` : ''}`}
              style={{ left: `${left}%`, width: `${ww * 0.6}%` }}
              onPointerDown={(e) => {
                e.preventDefault()
                onPress?.(m)
              }}
              tabIndex={-1}
              aria-label={noteName(m, lang)}
            >
              {fingers?.get(m) && <span className="kb-finger">{fingers.get(m)}</span>}
              {showNames === 'marked' && mark && <span className="kb-name">{noteName(m, lang, false)}</span>}
            </button>
          )
        })}
    </div>
  )
}
