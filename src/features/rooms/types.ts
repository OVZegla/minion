/** Plans de pièces et de maisons. Unités : centimètres. */

export interface Pt {
  x: number
  y: number
}

export interface Wall {
  id: string
  a: Pt
  b: Pt
  thickness: number
  height: number
  color: string
}

export interface Opening {
  id: string
  wallId: string
  kind: 'door' | 'window'
  t: number // position du centre le long du mur (0–1)
  width: number
  height: number
  sill: number // hauteur d'allège (fenêtre)
  flip?: boolean // sens d'ouverture de la porte
}

export interface Floor {
  id: string
  name: string
  points: Pt[]
  material: string // id de matériau
}

export interface Furniture {
  id: string
  type: string // id du catalogue
  x: number // centre
  y: number
  w: number
  d: number
  h: number
  rotation: number // degrés
  color: string
  material?: string
  label?: string
}

export interface Light {
  id: string
  x: number
  y: number
  z: number
  intensity: number // 0–2
  color: string
}

export interface PlanData {
  walls: Wall[]
  openings: Opening[]
  floors: Floor[]
  furniture: Furniture[]
  lights: Light[]
}

export interface Variant {
  id: string
  name: string
  data: PlanData
  createdAt: number
}

export interface RoomPlan {
  id: string
  createdAt: number
  updatedAt: number
  trashedAt?: number | null
  title: string
  data: PlanData
  variants: Variant[]
  ambience: { sun: number; warm: number; time: 'jour' | 'doree' | 'soir' }
  openedAt?: number
}
