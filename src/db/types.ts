export type EntityType =
  | 'note'
  | 'wish'
  | 'project'
  | 'moodboard'
  | 'event'
  | 'task'
  | 'journal'
  | 'thought'
  | 'treasure'
  | 'song'
  | 'deck'

export interface Base {
  id: string
  createdAt: number
  updatedAt: number
  trashedAt?: number | null
}

export interface Cover {
  kind: 'color' | 'gradient' | 'image'
  value: string // couleur, dégradé CSS ou id d'Asset
}

export interface Note extends Base {
  title: string
  content: unknown | null // JSON TipTap
  text: string // texte brut pour la recherche
  icon?: string
  cover?: Cover | null
  folderId?: string | null
  tags: string[]
  favorite: boolean
  inbox: boolean
  openedAt?: number
}

export interface Folder extends Base {
  name: string
  parentId?: string | null
  color?: string
}

export type WishState = 'someday' | 'exploring' | 'doing' | 'done'

export interface Wish extends Base {
  title: string
  description: string
  category: string
  state: WishState
  date?: string | null // AAAA-MM-JJ, facultative
  imageId?: string | null
  emoji?: string
  group?: string
  order: number
  style?: 'carte' | 'note' | 'polaroid'
  memory?: { date?: string; text: string; photoIds: string[] } | null
}

export interface Project extends Base {
  title: string
  intention: string
  cover?: Cover | null
  status: string // id de colonne
  startDate?: string | null
  endDate?: string | null
  order: number
  openedAt?: number
  resources?: { id: string; label: string; url: string }[]
  documents?: string[] // ids d'Asset (pièces jointes)
  results?: string[] // ids d'Asset (créations, photos du résultat)
}

export interface Task extends Base {
  title: string
  done: boolean
  date?: string | null
  projectId?: string | null
  order: number
}

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface CalendarEvent extends Base {
  title: string
  start: string // ISO local AAAA-MM-JJTHH:mm
  end: string
  allDay: boolean
  color: string
  kind: string
  recurrence: Recurrence
  reminders: number[] // minutes avant
  notes?: string
  exceptions?: string[] // dates (AAAA-MM-JJ) retirées d'une récurrence
}

export interface JournalEntry extends Base {
  date: string // AAAA-MM-JJ
  title?: string
  content: unknown | null
  text: string
  mood?: string | null
  highlights: string[]
  prides: string[]
  answers: Record<string, string>
  photoIds: string[]
  music?: string
}

export interface Thought extends Base {
  text: string
  group?: string | null
  color?: string
}

export type TreasureKind = 'phrase' | 'souvenir' | 'victoire' | 'image' | 'bienfait'

export interface Treasure extends Base {
  kind: TreasureKind
  text: string
  imageId?: string | null
}

export type MoodItemKind = 'image' | 'text' | 'palette' | 'link' | 'shape' | 'note' | 'swatch'

export interface MoodItem {
  id: string
  kind: MoodItemKind
  x: number
  y: number
  w: number
  h: number
  rotation: number
  z: number
  locked?: boolean
  // contenu selon le type
  text?: string
  imageId?: string
  colors?: string[]
  url?: string
  shape?: 'rect' | 'circle' | 'arch' | 'blob'
  fill?: string
  color?: string
  fontSize?: number
  font?: 'display' | 'body' | 'hand'
  label?: string
}

export interface Moodboard extends Base {
  title: string
  background: string
  items: MoodItem[]
  openedAt?: number
  featured?: boolean
}

export interface Palette extends Base {
  name: string
  colors: string[]
}

export interface Asset {
  id: string
  createdAt: number
  name: string
  type: string
  blob: Blob
}

export interface Link {
  id: string
  fromType: EntityType
  fromId: string
  toType: EntityType
  toId: string
  createdAt: number
}

export interface HomeBlock {
  id: 'today' | 'capture' | 'recent' | 'wish' | 'journal' | 'moodboard' | 'treasure' | 'projects' | 'song'
  visible: boolean
}

export interface Settings {
  id: 'settings'
  name: string
  accent: string
  theme: 'jour' | 'soir'
  homeBlocks: HomeBlock[]
  splash: boolean
  projectColumns: { id: string; name: string }[]
  wishCategories: string[]
  eventKinds: { id: string; name: string; color: string }[]
}

/* ---------- Atelier synthé ---------- */

export type Hand = 'R' | 'L'

export interface SongNote {
  id: string
  pitch: number // MIDI (60 = do central)
  start: number // en temps (noire = 1), depuis le début du morceau
  dur: number // en temps
  hand: Hand
  finger?: number | null // doigté 1–5
}

export interface Song extends Base {
  title: string
  bpm: number // tempo de référence
  timeSig: [number, number] // ex. [4, 4]
  measures: number
  notes: SongNote[]
  chords: { id: string; beat: number; name: string }[] // accords chiffrés (ex. « Am »)
  annotations: { id: string; beat: number; text: string }[]
  sections: { id: string; measure: number; name: string }[] // index de mesure (0 = première)
  noteNames: 'fr' | 'en'
  openedAt?: number
  lastPracticeAt?: number
}

/* ---------- Apprendre ---------- */

export interface Card {
  id: string
  q: string
  a: string
  /** passage de la note d'où vient la carte, si elle a été proposée automatiquement */
  source?: string | null
  auto?: boolean // proposée par Minion (à vérifier), sinon écrite par elle
  box: number // boîte de Leitner 0–4
  dueAt: number
  seen: number
  right: number
}

export interface Deck extends Base {
  title: string
  topic: string
  noteIds: string[]
  cards: Card[]
  summary?: { content: unknown | null; text: string; auto: boolean } | null
  deepen: { id: string; text: string; done: boolean }[] // ce que je veux approfondir
  lastSessionAt?: number
}
