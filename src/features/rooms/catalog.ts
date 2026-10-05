/** Bibliothèque de meubles et d'objets (dimensions par défaut en cm) et matériaux. */

export interface CatalogItem {
  id: string
  name: string
  category: 'Salon' | 'Chambre' | 'Cuisine' | 'Salle de bain' | 'Bureau' | 'Déco'
  w: number
  d: number
  h: number
  color: string
}

export const CATALOG: CatalogItem[] = [
  { id: 'sofa', name: 'Canapé', category: 'Salon', w: 210, d: 90, h: 85, color: '#c9b8a4' },
  { id: 'armchair', name: 'Fauteuil', category: 'Salon', w: 85, d: 85, h: 80, color: '#c98b8b' },
  { id: 'coffee', name: 'Table basse', category: 'Salon', w: 110, d: 60, h: 40, color: '#b08a64' },
  { id: 'tvunit', name: 'Meuble TV', category: 'Salon', w: 160, d: 40, h: 50, color: '#e8e1d6' },
  { id: 'shelf', name: 'Étagère', category: 'Salon', w: 90, d: 35, h: 180, color: '#b08a64' },
  { id: 'rug', name: 'Tapis', category: 'Déco', w: 200, d: 140, h: 1, color: '#d9c7b0' },
  { id: 'plant', name: 'Plante', category: 'Déco', w: 45, d: 45, h: 120, color: '#7a9a6e' },
  { id: 'lamp', name: 'Lampadaire', category: 'Déco', w: 40, d: 40, h: 160, color: '#f2e6cf' },
  { id: 'bed', name: 'Lit double', category: 'Chambre', w: 160, d: 205, h: 50, color: '#f3efe8' },
  { id: 'bedsingle', name: 'Lit simple', category: 'Chambre', w: 90, d: 200, h: 50, color: '#f3efe8' },
  { id: 'nightstand', name: 'Table de chevet', category: 'Chambre', w: 45, d: 40, h: 50, color: '#b08a64' },
  { id: 'wardrobe', name: 'Armoire', category: 'Chambre', w: 120, d: 60, h: 210, color: '#ece6dc' },
  { id: 'dresser', name: 'Commode', category: 'Chambre', w: 100, d: 45, h: 85, color: '#ece6dc' },
  { id: 'table', name: 'Table', category: 'Cuisine', w: 160, d: 90, h: 75, color: '#b08a64' },
  { id: 'chair', name: 'Chaise', category: 'Cuisine', w: 45, d: 50, h: 85, color: '#5b534b' },
  { id: 'counter', name: 'Plan de travail', category: 'Cuisine', w: 240, d: 62, h: 90, color: '#efeae2' },
  { id: 'fridge', name: 'Réfrigérateur', category: 'Cuisine', w: 60, d: 65, h: 185, color: '#e9e9e9' },
  { id: 'island', name: 'Îlot', category: 'Cuisine', w: 160, d: 90, h: 90, color: '#efeae2' },
  { id: 'bathtub', name: 'Baignoire', category: 'Salle de bain', w: 170, d: 75, h: 58, color: '#ffffff' },
  { id: 'shower', name: 'Douche', category: 'Salle de bain', w: 90, d: 90, h: 200, color: '#dfe8ef' },
  { id: 'sink', name: 'Lavabo', category: 'Salle de bain', w: 70, d: 48, h: 85, color: '#ffffff' },
  { id: 'wc', name: 'WC', category: 'Salle de bain', w: 38, d: 65, h: 80, color: '#ffffff' },
  { id: 'desk', name: 'Bureau', category: 'Bureau', w: 140, d: 70, h: 75, color: '#e8e1d6' },
  { id: 'officechair', name: 'Chaise de bureau', category: 'Bureau', w: 60, d: 60, h: 100, color: '#5b534b' },
  { id: 'piano', name: 'Clavier / synthé', category: 'Bureau', w: 130, d: 40, h: 80, color: '#2e2a26' },
]

export const catalogItem = (id: string) => CATALOG.find((c) => c.id === id)

export interface Material {
  id: string
  name: string
  kind: 'floor' | 'wall' | 'both'
  color: string
  pattern?: 'planks' | 'tiles' | 'herringbone' | 'none'
  roughness: number
}

export const MATERIALS: Material[] = [
  { id: 'oak', name: 'Parquet chêne clair', kind: 'floor', color: '#d4b48c', pattern: 'planks', roughness: 0.7 },
  { id: 'walnut', name: 'Parquet noyer', kind: 'floor', color: '#8a6446', pattern: 'planks', roughness: 0.6 },
  { id: 'herring', name: 'Point de Hongrie', kind: 'floor', color: '#c9a57a', pattern: 'herringbone', roughness: 0.65 },
  { id: 'tiles', name: 'Carrelage clair', kind: 'floor', color: '#e8e4dc', pattern: 'tiles', roughness: 0.4 },
  { id: 'terracotta', name: 'Tomettes', kind: 'floor', color: '#c8805f', pattern: 'tiles', roughness: 0.8 },
  { id: 'concrete', name: 'Béton ciré', kind: 'floor', color: '#bdb8b0', pattern: 'none', roughness: 0.5 },
  { id: 'carpet', name: 'Moquette douce', kind: 'floor', color: '#d8cfc2', pattern: 'none', roughness: 1 },
]

export const WALL_COLORS = ['#f4efe7', '#ffffff', '#e9d5cf', '#dfe6dc', '#dde4ec', '#e8e3f3', '#efe2c8', '#c8805f', '#8fa58a', '#2e2a26']
export const FURNITURE_COLORS = ['#f3efe8', '#e8e1d6', '#c9b8a4', '#b08a64', '#8a6446', '#5b534b', '#2e2a26', '#c98b8b', '#8fa58a', '#7f9db5', '#a397c4', '#c8805f', '#e8b60f']
