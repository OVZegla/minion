import type { WishState } from '../../db/types'

export const WISH_STATES: Record<WishState, { label: string; color: string; icon: string }> = {
  someday: { label: 'Un jour', color: '#a397c4', icon: 'moon' },
  exploring: { label: 'J’explore', color: '#7f9db5', icon: 'search' },
  doing: { label: 'En cours', color: '#c8805f', icon: 'sparkle' },
  done: { label: 'Accompli', color: '#8fa58a', icon: 'check' },
}

export const WISH_ORDER: WishState[] = ['someday', 'exploring', 'doing', 'done']

export const WISH_EMOJIS = ['✈️', '🌿', '🎹', '🎨', '🏡', '💡', '🌙', '📚', '🍰', '🌊', '⛰️', '🌸', '✨', '🎬', '🧵', '☕']
