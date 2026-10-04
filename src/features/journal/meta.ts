/** Humeurs facultatives : elle choisit, l'app n'interprète rien. */
export const MOODS = [
  { id: 'radieuse', emoji: '☀️', label: 'Radieuse' },
  { id: 'douce', emoji: '🌸', label: 'Douce' },
  { id: 'calme', emoji: '🍃', label: 'Calme' },
  { id: 'inspiree', emoji: '✨', label: 'Inspirée' },
  { id: 'fatiguee', emoji: '🌙', label: 'Fatiguée' },
  { id: 'pensive', emoji: '☁️', label: 'Pensive' },
  { id: 'agitee', emoji: '🌊', label: 'Agitée' },
  { id: 'lourde', emoji: '🌧️', label: 'Lourde' },
]

export const QUESTIONS = [
  { id: 'garder', q: 'Qu’ai-je envie de garder de cette journée ?' },
  { id: 'plaisir', q: 'Qu’est-ce qui m’a fait plaisir ?' },
  { id: 'preoccupe', q: 'Qu’est-ce qui me préoccupe ?' },
  { id: 'besoin', q: 'De quoi ai-je besoin ?' },
  { id: 'demain', q: 'Qu’aimerais-je essayer demain ?' },
]

export const moodOf = (id?: string | null) => MOODS.find((m) => m.id === id)
