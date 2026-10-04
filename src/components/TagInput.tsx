import { useState } from 'react'
import { Icon } from './Icon'

export function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState('')
  const add = (t: string) => {
    const tag = t.trim().replace(/^#/, '').toLowerCase()
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }
  const matches = draft ? suggestions.filter((s) => s.startsWith(draft.toLowerCase()) && !value.includes(s)).slice(0, 5) : []
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="chip">
          #{t}
          <button className="tag-x" aria-label={`Retirer ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      <div style={{ position: 'relative' }}>
        <input
          value={draft}
          placeholder={value.length ? '+ tag' : 'Ajouter un tag…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(draft)
            }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => draft && add(draft)}
        />
        {matches.length > 0 && (
          <div className="menu left" style={{ minWidth: 160 }}>
            {matches.map((m) => (
              <button key={m} className="menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)}>
                #{m}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
