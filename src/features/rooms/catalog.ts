/** Bibliothèque de meubles et d'objets (dimensions par défaut en cm) et matériaux. */

export const CATEGORIES = ['Salon', 'Chambre', 'Enfants', 'Cuisine', 'Salle de bain', 'Bureau', 'Musique et loisirs', 'Lumières', 'Plantes', 'Déco', 'Animaux', 'Extérieur'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_EMOJI: Record<Category, string> = {
  Salon: '🛋️',
  Chambre: '🛏️',
  Enfants: '🧸',
  Cuisine: '🍳',
  'Salle de bain': '🛁',
  Bureau: '💻',
  'Musique et loisirs': '🎸',
  Lumières: '💡',
  Plantes: '🌿',
  Déco: '🖼️',
  Animaux: '🐱',
  Extérieur: '🌳',
}

export interface CatalogItem {
  id: string
  name: string
  emoji: string
  category: Category
  w: number
  d: number
  h: number
  color: string
  /** forme 3D utilisée (par défaut : l'id) */
  model?: string
  /** dessiné rond sur le plan */
  round?: boolean
  /** hauteur de pose au-dessus du sol (objets accrochés au mur ou au plafond), en cm */
  elev?: number
  /** source de lumière : hauteur en cm depuis le bas de l'objet, couleur et puissance */
  glow?: { y: number; color: string; power: number; flicker?: boolean }
}

const WARM = '#ffc98a'

export const CATALOG: CatalogItem[] = [
  // Salon
  { id: 'sofa', name: 'Canapé', emoji: '🛋️', category: 'Salon', w: 210, d: 90, h: 85, color: '#c9b8a4' },
  { id: 'sofa-l', name: 'Canapé d’angle', emoji: '🛋️', category: 'Salon', w: 260, d: 170, h: 85, color: '#8fa58a', model: 'sofal' },
  { id: 'loveseat', name: 'Petit canapé', emoji: '🛋️', category: 'Salon', w: 150, d: 85, h: 80, color: '#c98b8b', model: 'sofa' },
  { id: 'armchair', name: 'Fauteuil', emoji: '💺', category: 'Salon', w: 85, d: 85, h: 80, color: '#c98b8b' },
  { id: 'pouf', name: 'Pouf', emoji: '🟤', category: 'Salon', w: 50, d: 50, h: 42, color: '#e8b60f', round: true },
  { id: 'beanbag', name: 'Poire', emoji: '🫘', category: 'Salon', w: 90, d: 90, h: 70, color: '#a397c4', round: true },
  { id: 'coffee', name: 'Table basse', emoji: '☕', category: 'Salon', w: 110, d: 60, h: 40, color: '#b08a64', model: 'table' },
  { id: 'coffee-round', name: 'Table basse ronde', emoji: '☕', category: 'Salon', w: 80, d: 80, h: 38, color: '#e8e1d6', model: 'roundtable', round: true },
  { id: 'tvunit', name: 'Meuble TV', emoji: '📺', category: 'Salon', w: 160, d: 40, h: 50, color: '#e8e1d6' },
  { id: 'sideboard', name: 'Buffet', emoji: '🗄️', category: 'Salon', w: 180, d: 45, h: 80, color: '#8a6446', model: 'cabinet' },
  { id: 'shelf', name: 'Étagère', emoji: '📚', category: 'Salon', w: 90, d: 35, h: 180, color: '#b08a64', model: 'bookcase' },
  { id: 'fireplace', name: 'Cheminée', emoji: '🔥', category: 'Salon', w: 140, d: 45, h: 110, color: '#efe9e0', glow: { y: 30, color: '#ff9440', power: 1.6, flicker: true } },
  { id: 'radiator', name: 'Radiateur', emoji: '♨️', category: 'Salon', w: 80, d: 10, h: 60, color: '#ffffff', elev: 15 },

  // Chambre
  { id: 'bed', name: 'Lit double', emoji: '🛏️', category: 'Chambre', w: 160, d: 205, h: 50, color: '#f3efe8' },
  { id: 'bedking', name: 'Grand lit', emoji: '🛏️', category: 'Chambre', w: 180, d: 210, h: 50, color: '#dde4ec', model: 'bed' },
  { id: 'bedsingle', name: 'Lit simple', emoji: '🛏️', category: 'Chambre', w: 90, d: 200, h: 50, color: '#f3efe8', model: 'bed' },
  { id: 'nightstand', name: 'Table de chevet', emoji: '🗄️', category: 'Chambre', w: 45, d: 40, h: 50, color: '#b08a64', model: 'cabinet' },
  { id: 'wardrobe', name: 'Armoire', emoji: '🚪', category: 'Chambre', w: 120, d: 60, h: 210, color: '#ece6dc' },
  { id: 'dresser', name: 'Commode', emoji: '🗄️', category: 'Chambre', w: 100, d: 45, h: 85, color: '#ece6dc', model: 'cabinet' },
  { id: 'vanity', name: 'Coiffeuse', emoji: '💄', category: 'Chambre', w: 100, d: 45, h: 75, color: '#e9d5cf' },
  { id: 'mirror', name: 'Miroir sur pied', emoji: '🪞', category: 'Chambre', w: 60, d: 40, h: 170, color: '#c9a57a' },
  { id: 'clothesrack', name: 'Portant', emoji: '👗', category: 'Chambre', w: 120, d: 45, h: 160, color: '#2e2a26' },

  // Enfants
  { id: 'bunk', name: 'Lits superposés', emoji: '🪜', category: 'Enfants', w: 100, d: 200, h: 160, color: '#7f9db5' },
  { id: 'crib', name: 'Lit bébé', emoji: '👶', category: 'Enfants', w: 70, d: 130, h: 90, color: '#ffffff' },
  { id: 'teepee', name: 'Tipi', emoji: '⛺', category: 'Enfants', w: 120, d: 120, h: 160, color: '#efe2c8', round: true },
  { id: 'toybox', name: 'Coffre à jouets', emoji: '🧰', category: 'Enfants', w: 80, d: 45, h: 50, color: '#e8b60f' },
  { id: 'teddy', name: 'Gros nounours', emoji: '🧸', category: 'Enfants', w: 50, d: 40, h: 60, color: '#b08a64' },
  { id: 'ball', name: 'Ballon', emoji: '⚽', category: 'Enfants', w: 25, d: 25, h: 25, color: '#c98b8b', round: true },
  { id: 'kidtable', name: 'Petite table', emoji: '🖍️', category: 'Enfants', w: 70, d: 50, h: 50, color: '#8fa58a', model: 'table' },
  { id: 'rocking', name: 'Cheval à bascule', emoji: '🐴', category: 'Enfants', w: 30, d: 80, h: 65, color: '#c8805f' },

  // Cuisine
  { id: 'table', name: 'Table', emoji: '🍽️', category: 'Cuisine', w: 160, d: 90, h: 75, color: '#b08a64' },
  { id: 'roundtable', name: 'Table ronde', emoji: '🍽️', category: 'Cuisine', w: 110, d: 110, h: 75, color: '#e8e1d6', round: true },
  { id: 'chair', name: 'Chaise', emoji: '🪑', category: 'Cuisine', w: 45, d: 50, h: 85, color: '#5b534b' },
  { id: 'stool', name: 'Tabouret haut', emoji: '🪑', category: 'Cuisine', w: 38, d: 38, h: 75, color: '#b08a64', round: true },
  { id: 'bench', name: 'Banc', emoji: '🪵', category: 'Cuisine', w: 140, d: 35, h: 45, color: '#b08a64' },
  { id: 'counter', name: 'Plan de travail', emoji: '🧑‍🍳', category: 'Cuisine', w: 240, d: 62, h: 90, color: '#efeae2' },
  { id: 'kitchensink', name: 'Évier', emoji: '🚰', category: 'Cuisine', w: 120, d: 62, h: 90, color: '#efeae2' },
  { id: 'stove', name: 'Cuisinière', emoji: '🍳', category: 'Cuisine', w: 60, d: 62, h: 90, color: '#e9e9e9' },
  { id: 'fridge', name: 'Réfrigérateur', emoji: '🧊', category: 'Cuisine', w: 60, d: 65, h: 185, color: '#e9e9e9' },
  { id: 'island', name: 'Îlot', emoji: '🏝️', category: 'Cuisine', w: 160, d: 90, h: 90, color: '#efeae2', model: 'counter' },
  { id: 'washer', name: 'Lave-linge', emoji: '🫧', category: 'Cuisine', w: 60, d: 60, h: 85, color: '#ffffff' },
  { id: 'wallcab', name: 'Placard haut', emoji: '🗄️', category: 'Cuisine', w: 120, d: 35, h: 70, color: '#efeae2', model: 'cabinet', elev: 145 },

  // Salle de bain
  { id: 'bathtub', name: 'Baignoire', emoji: '🛁', category: 'Salle de bain', w: 170, d: 75, h: 58, color: '#ffffff' },
  { id: 'clawtub', name: 'Baignoire à pieds', emoji: '🛁', category: 'Salle de bain', w: 165, d: 75, h: 70, color: '#c98b8b' },
  { id: 'shower', name: 'Douche', emoji: '🚿', category: 'Salle de bain', w: 90, d: 90, h: 200, color: '#dfe8ef' },
  { id: 'sink', name: 'Lavabo', emoji: '🚰', category: 'Salle de bain', w: 70, d: 48, h: 85, color: '#ece6dc' },
  { id: 'dblsink', name: 'Double vasque', emoji: '🚰', category: 'Salle de bain', w: 140, d: 50, h: 85, color: '#b08a64', model: 'sink' },
  { id: 'wc', name: 'WC', emoji: '🚽', category: 'Salle de bain', w: 38, d: 65, h: 80, color: '#ffffff' },
  { id: 'towelrack', name: 'Porte-serviettes', emoji: '🧺', category: 'Salle de bain', w: 55, d: 8, h: 100, color: '#7f9db5', elev: 40 },
  { id: 'wallmirror', name: 'Miroir mural', emoji: '🪞', category: 'Salle de bain', w: 70, d: 4, h: 80, color: '#c9a57a', model: 'frame', elev: 110 },

  // Bureau
  { id: 'desk', name: 'Bureau', emoji: '🖥️', category: 'Bureau', w: 140, d: 70, h: 75, color: '#e8e1d6', model: 'table' },
  { id: 'officechair', name: 'Chaise de bureau', emoji: '🪑', category: 'Bureau', w: 60, d: 60, h: 100, color: '#5b534b' },
  { id: 'monitor', name: 'Écran', emoji: '🖥️', category: 'Bureau', w: 60, d: 20, h: 45, color: '#2e2a26', elev: 75 },
  { id: 'laptop', name: 'Ordinateur portable', emoji: '💻', category: 'Bureau', w: 34, d: 24, h: 22, color: '#bdb8b0', elev: 75 },
  { id: 'filecab', name: 'Caisson', emoji: '🗃️', category: 'Bureau', w: 42, d: 55, h: 60, color: '#e8e1d6', model: 'cabinet' },
  { id: 'wallshelf', name: 'Étagère murale', emoji: '📏', category: 'Bureau', w: 100, d: 22, h: 4, color: '#b08a64', elev: 150 },
  { id: 'corkboard', name: 'Tableau d’inspiration', emoji: '📌', category: 'Bureau', w: 90, d: 3, h: 60, color: '#c9a57a', model: 'frame', elev: 120 },

  // Musique et loisirs
  { id: 'piano', name: 'Clavier / synthé', emoji: '🎹', category: 'Musique et loisirs', w: 130, d: 40, h: 80, color: '#2e2a26' },
  { id: 'uprightpiano', name: 'Piano droit', emoji: '🎹', category: 'Musique et loisirs', w: 150, d: 60, h: 125, color: '#2e2a26' },
  { id: 'guitar', name: 'Guitare', emoji: '🎸', category: 'Musique et loisirs', w: 40, d: 30, h: 100, color: '#c8805f' },
  { id: 'drums', name: 'Batterie', emoji: '🥁', category: 'Musique et loisirs', w: 150, d: 120, h: 110, color: '#c98b8b' },
  { id: 'speaker', name: 'Enceinte', emoji: '🔊', category: 'Musique et loisirs', w: 25, d: 28, h: 100, color: '#2e2a26' },
  { id: 'turntable', name: 'Platine vinyle', emoji: '💿', category: 'Musique et loisirs', w: 45, d: 36, h: 70, color: '#b08a64' },
  { id: 'easel', name: 'Chevalet', emoji: '🎨', category: 'Musique et loisirs', w: 70, d: 60, h: 170, color: '#b08a64' },
  { id: 'sewing', name: 'Table de couture', emoji: '🧵', category: 'Musique et loisirs', w: 110, d: 55, h: 75, color: '#e9d5cf', model: 'table' },
  { id: 'yogamat', name: 'Tapis de yoga', emoji: '🧘', category: 'Musique et loisirs', w: 61, d: 183, h: 1, color: '#a397c4', model: 'rug' },
  { id: 'bike', name: 'Vélo d’appartement', emoji: '🚲', category: 'Musique et loisirs', w: 55, d: 110, h: 120, color: '#5b534b' },

  // Lumières
  { id: 'lamp', name: 'Lampadaire', emoji: '🪔', category: 'Lumières', w: 40, d: 40, h: 160, color: '#f2e6cf', round: true, glow: { y: 145, color: WARM, power: 1 } },
  { id: 'arclamp', name: 'Lampe arc', emoji: '🪔', category: 'Lumières', w: 40, d: 150, h: 200, color: '#2e2a26', glow: { y: 185, color: WARM, power: 1 } },
  { id: 'tablelamp', name: 'Lampe à poser', emoji: '💡', category: 'Lumières', w: 30, d: 30, h: 45, color: '#efe2c8', round: true, elev: 50, glow: { y: 35, color: WARM, power: 0.7 } },
  { id: 'pendant', name: 'Suspension', emoji: '💡', category: 'Lumières', w: 45, d: 45, h: 60, color: '#e8b60f', round: true, elev: 170, glow: { y: 5, color: WARM, power: 1.2 } },
  { id: 'candles', name: 'Bougies', emoji: '🕯️', category: 'Lumières', w: 25, d: 15, h: 18, color: '#f3efe8', elev: 40, glow: { y: 18, color: '#ffb066', power: 0.45, flicker: true } },
  { id: 'fairy', name: 'Guirlande lumineuse', emoji: '✨', category: 'Lumières', w: 200, d: 4, h: 30, color: '#ffe2a8', elev: 190, glow: { y: 0, color: '#ffd38a', power: 0.6 } },
  { id: 'neon', name: 'Néon cœur', emoji: '💗', category: 'Lumières', w: 50, d: 4, h: 45, color: '#ff6fa8', elev: 150, glow: { y: 22, color: '#ff6fa8', power: 0.8 } },
  { id: 'lantern', name: 'Lanterne', emoji: '🏮', category: 'Lumières', w: 25, d: 25, h: 40, color: '#2e2a26', round: true, glow: { y: 18, color: '#ffb066', power: 0.6, flicker: true } },

  // Plantes
  { id: 'plant', name: 'Plante', emoji: '🪴', category: 'Plantes', w: 45, d: 45, h: 120, color: '#7a9a6e', round: true },
  { id: 'tallplant', name: 'Grande plante', emoji: '🌴', category: 'Plantes', w: 70, d: 70, h: 190, color: '#5f8a5a', round: true },
  { id: 'smallplant', name: 'Petite plante', emoji: '🌱', category: 'Plantes', w: 22, d: 22, h: 30, color: '#8fb07e', round: true, elev: 0 },
  { id: 'cactus', name: 'Cactus', emoji: '🌵', category: 'Plantes', w: 30, d: 30, h: 80, color: '#6f9a6a', round: true },
  { id: 'flowers', name: 'Bouquet', emoji: '💐', category: 'Plantes', w: 25, d: 25, h: 50, color: '#e98fb0', round: true },
  { id: 'hanging', name: 'Plante suspendue', emoji: '🌿', category: 'Plantes', w: 40, d: 40, h: 70, color: '#7a9a6e', round: true, elev: 150 },

  // Déco
  { id: 'rug', name: 'Tapis', emoji: '🟫', category: 'Déco', w: 200, d: 140, h: 1, color: '#d9c7b0' },
  { id: 'roundrug', name: 'Tapis rond', emoji: '⭕', category: 'Déco', w: 160, d: 160, h: 1, color: '#c98b8b', round: true },
  { id: 'frame', name: 'Tableau', emoji: '🖼️', category: 'Déco', w: 80, d: 3, h: 60, color: '#7f9db5', elev: 120 },
  { id: 'clock', name: 'Horloge', emoji: '🕰️', category: 'Déco', w: 35, d: 4, h: 35, color: '#2e2a26', elev: 170 },
  { id: 'aquarium', name: 'Aquarium', emoji: '🐠', category: 'Déco', w: 100, d: 40, h: 130, color: '#2e2a26', glow: { y: 105, color: '#7fd4ff', power: 0.5 } },
  { id: 'vase', name: 'Grand vase', emoji: '🏺', category: 'Déco', w: 30, d: 30, h: 60, color: '#c8805f', round: true },
  { id: 'globe', name: 'Globe', emoji: '🌍', category: 'Déco', w: 30, d: 30, h: 45, color: '#7f9db5', round: true, elev: 0 },
  { id: 'screen', name: 'Paravent', emoji: '🎎', category: 'Déco', w: 150, d: 30, h: 170, color: '#efe2c8' },
  { id: 'cushions', name: 'Coussins de sol', emoji: '🟣', category: 'Déco', w: 110, d: 60, h: 20, color: '#a397c4' },

  // Animaux
  { id: 'catbed', name: 'Panier', emoji: '🐱', category: 'Animaux', w: 60, d: 60, h: 20, color: '#c9b8a4', round: true, model: 'petbed' },
  { id: 'cattree', name: 'Arbre à chat', emoji: '🐈', category: 'Animaux', w: 60, d: 60, h: 150, color: '#d9c7b0' },
  { id: 'cat', name: 'Chat', emoji: '🐈‍⬛', category: 'Animaux', w: 25, d: 45, h: 30, color: '#e8a35a' },
  { id: 'dogbed', name: 'Coussin pour chien', emoji: '🐶', category: 'Animaux', w: 100, d: 75, h: 22, color: '#8fa58a', model: 'petbed' },

  // Extérieur
  { id: 'tree', name: 'Arbre', emoji: '🌳', category: 'Extérieur', w: 300, d: 300, h: 450, color: '#6f9a5e', round: true },
  { id: 'pine', name: 'Sapin', emoji: '🌲', category: 'Extérieur', w: 180, d: 180, h: 400, color: '#4f7a55', round: true },
  { id: 'bush', name: 'Buisson', emoji: '🌿', category: 'Extérieur', w: 100, d: 100, h: 80, color: '#7a9a6e', round: true },
  { id: 'parasol', name: 'Parasol', emoji: '⛱️', category: 'Extérieur', w: 250, d: 250, h: 240, color: '#f2e6cf', round: true },
  { id: 'lounger', name: 'Transat', emoji: '🏖️', category: 'Extérieur', w: 65, d: 190, h: 80, color: '#7f9db5' },
  { id: 'gardentable', name: 'Table de jardin', emoji: '🍋', category: 'Extérieur', w: 90, d: 90, h: 72, color: '#8fa58a', model: 'roundtable', round: true },
  { id: 'bbq', name: 'Barbecue', emoji: '🍖', category: 'Extérieur', w: 60, d: 60, h: 95, color: '#2e2a26', round: true, glow: { y: 80, color: '#ff8a3d', power: 0.5, flicker: true } },
  { id: 'pool', name: 'Piscine', emoji: '🏊', category: 'Extérieur', w: 600, d: 300, h: 10, color: '#4fb3d9' },
  { id: 'fence', name: 'Clôture', emoji: '🚧', category: 'Extérieur', w: 200, d: 6, h: 100, color: '#efe9e0' },
  { id: 'hammock', name: 'Hamac', emoji: '🌞', category: 'Extérieur', w: 120, d: 300, h: 150, color: '#e8b60f' },
  { id: 'firepit', name: 'Brasero', emoji: '🔥', category: 'Extérieur', w: 80, d: 80, h: 40, color: '#5b534b', round: true, glow: { y: 35, color: '#ff8a3d', power: 1.2, flicker: true } },
  { id: 'path', name: 'Pas japonais', emoji: '🪨', category: 'Extérieur', w: 60, d: 200, h: 3, color: '#bdb8b0' },

  // ——— encore plus d'objets ———
  // Salon
  { id: 'recliner', name: 'Fauteuil relax', emoji: '😌', category: 'Salon', w: 90, d: 95, h: 100, color: '#8a6446', model: 'armchair' },
  { id: 'eggchair', name: 'Fauteuil œuf suspendu', emoji: '🥚', category: 'Salon', w: 100, d: 100, h: 195, color: '#efe2c8', round: true },
  { id: 'chaiselongue', name: 'Méridienne', emoji: '🛋️', category: 'Salon', w: 75, d: 170, h: 75, color: '#a397c4', model: 'lounger' },
  { id: 'cubeshelf', name: 'Étagère à cases', emoji: '🔲', category: 'Salon', w: 150, d: 39, h: 150, color: '#ffffff' },
  { id: 'ladder', name: 'Étagère échelle', emoji: '🪜', category: 'Salon', w: 60, d: 40, h: 180, color: '#b08a64' },
  { id: 'barcart', name: 'Desserte', emoji: '🍸', category: 'Salon', w: 70, d: 40, h: 80, color: '#c9a57a' },
  { id: 'console', name: 'Console d’entrée', emoji: '🗝️', category: 'Salon', w: 110, d: 35, h: 80, color: '#2e2a26', model: 'table' },
  { id: 'bigtv', name: 'Grand meuble TV', emoji: '📺', category: 'Salon', w: 220, d: 45, h: 45, color: '#8a6446', model: 'tvunit' },
  { id: 'sidetable', name: 'Bout de canapé', emoji: '🔘', category: 'Salon', w: 45, d: 45, h: 55, color: '#c9a57a', model: 'roundtable', round: true },
  { id: 'coatrack', name: 'Portemanteau', emoji: '🧥', category: 'Salon', w: 50, d: 50, h: 180, color: '#2e2a26', round: true },
  { id: 'shoerack', name: 'Meuble à chaussures', emoji: '👟', category: 'Salon', w: 80, d: 30, h: 50, color: '#e8e1d6' },
  { id: 'umbrella', name: 'Porte-parapluies', emoji: '☂️', category: 'Salon', w: 25, d: 25, h: 50, color: '#7f9db5', round: true, model: 'trashbin' },

  // Chambre
  { id: 'canopy', name: 'Lit à baldaquin', emoji: '👑', category: 'Chambre', w: 170, d: 215, h: 210, color: '#e9d5cf' },
  { id: 'daybed', name: 'Lit de repos', emoji: '😴', category: 'Chambre', w: 95, d: 200, h: 45, color: '#8fa58a', model: 'bed' },
  { id: 'chest', name: 'Malle', emoji: '🧳', category: 'Chambre', w: 90, d: 50, h: 50, color: '#8a6446', model: 'toybox' },
  { id: 'benchbed', name: 'Banc de lit', emoji: '🪵', category: 'Chambre', w: 130, d: 40, h: 45, color: '#c9b8a4', model: 'pouf' },
  { id: 'laundry', name: 'Panier à linge', emoji: '🧺', category: 'Chambre', w: 45, d: 45, h: 60, color: '#d9c09a', round: true },
  { id: 'ironing', name: 'Planche à repasser', emoji: '👕', category: 'Chambre', w: 120, d: 38, h: 90, color: '#7f9db5' },
  { id: 'jewelry', name: 'Petit miroir', emoji: '💍', category: 'Chambre', w: 40, d: 4, h: 50, color: '#c9a57a', model: 'frame', elev: 120 },

  // Enfants
  { id: 'highchair', name: 'Chaise haute', emoji: '🍼', category: 'Enfants', w: 55, d: 60, h: 100, color: '#ffffff' },
  { id: 'playpen', name: 'Parc bébé', emoji: '🧷', category: 'Enfants', w: 100, d: 100, h: 70, color: '#e8e1d6', model: 'crib' },
  { id: 'changing', name: 'Table à langer', emoji: '🧴', category: 'Enfants', w: 90, d: 55, h: 95, color: '#dde4ec', model: 'cabinet' },
  { id: 'slide', name: 'Toboggan', emoji: '🛝', category: 'Enfants', w: 60, d: 200, h: 130, color: '#e8b60f' },
  { id: 'swing', name: 'Balançoire', emoji: '🎠', category: 'Enfants', w: 200, d: 150, h: 200, color: '#c98b8b' },
  { id: 'trampoline', name: 'Trampoline', emoji: '🤸', category: 'Enfants', w: 250, d: 250, h: 70, color: '#4f6f9a', round: true },
  { id: 'sandbox', name: 'Bac à sable', emoji: '🏖️', category: 'Enfants', w: 150, d: 150, h: 25, color: '#b08a64' },
  { id: 'dollhouse', name: 'Maison de poupée', emoji: '🏠', category: 'Enfants', w: 70, d: 35, h: 80, color: '#e9c9c4' },
  { id: 'balloons', name: 'Ballons', emoji: '🎈', category: 'Enfants', w: 50, d: 50, h: 170, color: '#ff6fa8', round: true },
  { id: 'kidrug', name: 'Tapis de jeu', emoji: '🧩', category: 'Enfants', w: 150, d: 100, h: 1, color: '#8fd0ea', model: 'rug' },
  { id: 'beanbagkid', name: 'Petite poire', emoji: '🫘', category: 'Enfants', w: 60, d: 60, h: 50, color: '#e8b60f', model: 'beanbag', round: true },
  { id: 'loftbed', name: 'Lit mezzanine', emoji: '🪜', category: 'Enfants', w: 100, d: 200, h: 180, color: '#ffffff', model: 'bunk' },

  // Cuisine
  { id: 'dishwasher', name: 'Lave-vaisselle', emoji: '🍽️', category: 'Cuisine', w: 60, d: 60, h: 85, color: '#e9e9e9', model: 'cabinet' },
  { id: 'dryer', name: 'Sèche-linge', emoji: '🌀', category: 'Cuisine', w: 60, d: 60, h: 85, color: '#ffffff', model: 'washer' },
  { id: 'ovencol', name: 'Colonne four', emoji: '🔥', category: 'Cuisine', w: 60, d: 60, h: 210, color: '#efeae2', model: 'fridge' },
  { id: 'pantry', name: 'Garde-manger', emoji: '🥫', category: 'Cuisine', w: 80, d: 45, h: 200, color: '#dfe6dc', model: 'wardrobe' },
  { id: 'microwave', name: 'Micro-ondes', emoji: '📦', category: 'Cuisine', w: 50, d: 38, h: 30, color: '#e9e9e9', elev: 90 },
  { id: 'coffeemachine', name: 'Machine à café', emoji: '☕', category: 'Cuisine', w: 25, d: 38, h: 38, color: '#2e2a26', elev: 90 },
  { id: 'fruitbowl', name: 'Corbeille de fruits', emoji: '🍎', category: 'Cuisine', w: 35, d: 35, h: 15, color: '#efe9e0', round: true, elev: 75 },
  { id: 'winerack', name: 'Casier à bouteilles', emoji: '🍷', category: 'Cuisine', w: 60, d: 30, h: 90, color: '#8a6446' },
  { id: 'trashbin', name: 'Poubelle', emoji: '🗑️', category: 'Cuisine', w: 35, d: 35, h: 65, color: '#c9c9c9', round: true },
  { id: 'barstool', name: 'Tabouret bas', emoji: '🪑', category: 'Cuisine', w: 35, d: 35, h: 45, color: '#2e2a26', model: 'stool', round: true },
  { id: 'diningbench', name: 'Banquette', emoji: '🛋️', category: 'Cuisine', w: 160, d: 55, h: 85, color: '#7f9db5', model: 'sofa' },

  // Salle de bain
  { id: 'jacuzzi', name: 'Baignoire balnéo', emoji: '🫧', category: 'Salle de bain', w: 180, d: 180, h: 60, color: '#ffffff', model: 'hottub' },
  { id: 'bidet', name: 'Bidet', emoji: '🚽', category: 'Salle de bain', w: 38, d: 55, h: 40, color: '#ffffff', model: 'wc' },
  { id: 'bathmat', name: 'Tapis de bain', emoji: '🟦', category: 'Salle de bain', w: 80, d: 50, h: 1, color: '#9fb4c8', model: 'rug' },
  { id: 'bathcab', name: 'Colonne de rangement', emoji: '🗄️', category: 'Salle de bain', w: 40, d: 30, h: 170, color: '#ffffff', model: 'cabinet' },
  { id: 'towels', name: 'Pile de serviettes', emoji: '🧻', category: 'Salle de bain', w: 40, d: 30, h: 30, color: '#f2c9c0', model: 'bookstack' },
  { id: 'bathladder', name: 'Échelle à serviettes', emoji: '🪜', category: 'Salle de bain', w: 45, d: 35, h: 160, color: '#b08a64', model: 'ladder' },

  // Bureau
  { id: 'gamingchair', name: 'Fauteuil gamer', emoji: '🎮', category: 'Bureau', w: 65, d: 65, h: 130, color: '#c98b8b', model: 'officechair' },
  { id: 'standingdesk', name: 'Bureau assis-debout', emoji: '🧍', category: 'Bureau', w: 160, d: 80, h: 105, color: '#2e2a26', model: 'table' },
  { id: 'printer', name: 'Imprimante', emoji: '🖨️', category: 'Bureau', w: 45, d: 35, h: 20, color: '#e9e9e9', elev: 75 },
  { id: 'whiteboard', name: 'Tableau blanc', emoji: '📝', category: 'Bureau', w: 120, d: 3, h: 80, color: '#c9c9c9', model: 'frame', elev: 100 },
  { id: 'desklamp', name: 'Lampe de bureau', emoji: '🔦', category: 'Bureau', w: 20, d: 30, h: 45, color: '#e8b60f', elev: 75, glow: { y: 40, color: '#fff2d8', power: 0.5 } },
  { id: 'bookstack', name: 'Pile de livres', emoji: '📚', category: 'Bureau', w: 30, d: 22, h: 25, color: '#c98b8b' },

  // Musique et loisirs
  { id: 'grandpiano', name: 'Piano à queue', emoji: '🎼', category: 'Musique et loisirs', w: 150, d: 190, h: 100, color: '#1d1a18' },
  { id: 'micstand', name: 'Micro sur pied', emoji: '🎤', category: 'Musique et loisirs', w: 40, d: 40, h: 160, color: '#2e2a26', round: true },
  { id: 'amp', name: 'Ampli', emoji: '🎚️', category: 'Musique et loisirs', w: 50, d: 28, h: 45, color: '#2e2a26', model: 'speaker' },
  { id: 'pooltable', name: 'Billard', emoji: '🎱', category: 'Musique et loisirs', w: 140, d: 250, h: 80, color: '#3f7a55' },
  { id: 'pingpong', name: 'Ping-pong', emoji: '🏓', category: 'Musique et loisirs', w: 152, d: 274, h: 76, color: '#2f5f8a' },
  { id: 'dartboard', name: 'Cible de fléchettes', emoji: '🎯', category: 'Musique et loisirs', w: 45, d: 4, h: 45, color: '#2e2a26', model: 'clock', elev: 150 },
  { id: 'treadmill', name: 'Tapis de course', emoji: '🏃', category: 'Musique et loisirs', w: 80, d: 180, h: 140, color: '#2e2a26' },
  { id: 'weights', name: 'Haltères', emoji: '🏋️', category: 'Musique et loisirs', w: 80, d: 40, h: 90, color: '#5b534b' },
  { id: 'punchbag', name: 'Sac de frappe', emoji: '🥊', category: 'Musique et loisirs', w: 40, d: 40, h: 110, color: '#c98b8b', round: true, elev: 60 },
  { id: 'yogaball', name: 'Ballon de gym', emoji: '🔵', category: 'Musique et loisirs', w: 65, d: 65, h: 65, color: '#a397c4', model: 'ball', round: true },
  { id: 'telescope', name: 'Télescope', emoji: '🔭', category: 'Musique et loisirs', w: 70, d: 70, h: 140, color: '#ffffff', round: true },
  { id: 'gameconsole', name: 'Console de jeux', emoji: '🕹️', category: 'Musique et loisirs', w: 30, d: 25, h: 8, color: '#ffffff', elev: 50, model: 'printer' },

  // Lumières
  { id: 'chandelier', name: 'Lustre', emoji: '🕯️', category: 'Lumières', w: 70, d: 70, h: 50, color: '#c9a57a', round: true, elev: 190, glow: { y: 15, color: '#ffd38a', power: 1.4 } },
  { id: 'paperlantern', name: 'Boule en papier', emoji: '⚪', category: 'Lumières', w: 50, d: 50, h: 50, color: '#fbf6ee', round: true, elev: 185, glow: { y: 25, color: '#fff0d6', power: 1 } },
  { id: 'sconce', name: 'Applique murale', emoji: '🔆', category: 'Lumières', w: 20, d: 15, h: 25, color: '#c9a57a', elev: 170, glow: { y: 15, color: WARM, power: 0.5 } },
  { id: 'lavalamp', name: 'Lampe à lave', emoji: '🌋', category: 'Lumières', w: 15, d: 15, h: 40, color: '#ff6fa8', round: true, elev: 50, glow: { y: 25, color: '#ff8ab8', power: 0.4 } },
  { id: 'moonlamp', name: 'Lampe lune', emoji: '🌕', category: 'Lumières', w: 25, d: 25, h: 30, color: '#fff3d6', round: true, elev: 50, glow: { y: 18, color: '#fff0c8', power: 0.5 } },
  { id: 'discoball', name: 'Boule disco', emoji: '🪩', category: 'Lumières', w: 30, d: 30, h: 30, color: '#e4ecf2', round: true, elev: 200, glow: { y: 15, color: '#d9c8ff', power: 0.4 } },
  { id: 'ceilingfan', name: 'Ventilateur de plafond', emoji: '🌀', category: 'Lumières', w: 120, d: 120, h: 30, color: '#b08a64', round: true, elev: 215, glow: { y: 0, color: WARM, power: 0.7 } },
  { id: 'xmastree', name: 'Sapin de Noël', emoji: '🎄', category: 'Lumières', w: 110, d: 110, h: 200, color: '#3f6f4a', round: true, glow: { y: 110, color: '#ffd38a', power: 0.8, flicker: true } },
  { id: 'streetlamp', name: 'Réverbère', emoji: '🏮', category: 'Lumières', w: 40, d: 40, h: 300, color: '#2e2a26', round: true, glow: { y: 275, color: WARM, power: 1.4 } },
  { id: 'gardenlights', name: 'Bornes lumineuses', emoji: '🔅', category: 'Lumières', w: 200, d: 15, h: 40, color: '#2e2a26', glow: { y: 35, color: '#ffe2a8', power: 0.7 } },

  // Plantes
  { id: 'monstera', name: 'Monstera', emoji: '🌿', category: 'Plantes', w: 90, d: 90, h: 130, color: '#3f7a4a', model: 'tallplant', round: true },
  { id: 'olive', name: 'Olivier en pot', emoji: '🫒', category: 'Plantes', w: 80, d: 80, h: 170, color: '#9aab84', model: 'pottree', round: true },
  { id: 'lemon', name: 'Citronnier', emoji: '🍋', category: 'Plantes', w: 80, d: 80, h: 160, color: '#5f8a5a', model: 'pottree', round: true },
  { id: 'bonsai', name: 'Bonsaï', emoji: '🌳', category: 'Plantes', w: 35, d: 25, h: 35, color: '#5f8a5a', model: 'smallplant', elev: 75 },
  { id: 'sunflower', name: 'Tournesols', emoji: '🌻', category: 'Plantes', w: 40, d: 40, h: 140, color: '#f2c12e', round: true },
  { id: 'orchid', name: 'Orchidée', emoji: '🌸', category: 'Plantes', w: 20, d: 20, h: 55, color: '#e8b4e0', model: 'flowers', round: true, elev: 75 },
  { id: 'terrarium', name: 'Terrarium', emoji: '🫙', category: 'Plantes', w: 30, d: 30, h: 35, color: '#7a9a6e', round: true, elev: 75 },
  { id: 'herbs', name: 'Herbes aromatiques', emoji: '🌱', category: 'Plantes', w: 50, d: 15, h: 25, color: '#7a9a6e', elev: 90 },
  { id: 'bamboo', name: 'Bambou', emoji: '🎋', category: 'Plantes', w: 50, d: 50, h: 200, color: '#8fb07e', round: true },
  { id: 'succulents', name: 'Succulentes', emoji: '🪴', category: 'Plantes', w: 40, d: 20, h: 15, color: '#9cc3a0', model: 'herbs', elev: 75 },
  { id: 'plantstand', name: 'Escalier à plantes', emoji: '🪜', category: 'Plantes', w: 80, d: 40, h: 100, color: '#b08a64', model: 'plantladder' },

  // Déco
  { id: 'statue', name: 'Sculpture', emoji: '🗿', category: 'Déco', w: 40, d: 40, h: 150, color: '#efe9e0' },
  { id: 'bigmirror', name: 'Grand miroir', emoji: '🪞', category: 'Déco', w: 80, d: 4, h: 180, color: '#c9a57a', model: 'frame', elev: 10 },
  { id: 'gallery', name: 'Mur de cadres', emoji: '🖼️', category: 'Déco', w: 150, d: 3, h: 90, color: '#2e2a26', elev: 110 },
  { id: 'poster', name: 'Affiche', emoji: '🎞️', category: 'Déco', w: 50, d: 2, h: 70, color: '#ffffff', model: 'frame', elev: 120 },
  { id: 'macrame', name: 'Macramé', emoji: '🪢', category: 'Déco', w: 60, d: 3, h: 90, color: '#efe2c8', elev: 110 },
  { id: 'magazine', name: 'Porte-revues', emoji: '📰', category: 'Déco', w: 40, d: 30, h: 45, color: '#b08a64', model: 'bookstack' },
  { id: 'gifts', name: 'Cadeaux', emoji: '🎁', category: 'Déco', w: 60, d: 50, h: 40, color: '#c98b8b' },
  { id: 'pumpkin', name: 'Citrouille', emoji: '🎃', category: 'Déco', w: 40, d: 40, h: 30, color: '#e8822e', round: true },
  { id: 'sheepskin', name: 'Peau de mouton', emoji: '🐑', category: 'Déco', w: 100, d: 70, h: 2, color: '#fbf8f2', model: 'roundrug', round: true },

  // Animaux
  { id: 'doghouse', name: 'Niche', emoji: '🐕', category: 'Animaux', w: 80, d: 100, h: 90, color: '#c8805f' },
  { id: 'dog', name: 'Chien', emoji: '🐕', category: 'Animaux', w: 30, d: 70, h: 55, color: '#c9a57a', model: 'cat' },
  { id: 'birdcage', name: 'Cage à oiseaux', emoji: '🐦', category: 'Animaux', w: 45, d: 45, h: 70, color: '#ffffff', round: true, elev: 75 },
  { id: 'fishbowl', name: 'Bocal à poisson', emoji: '🐟', category: 'Animaux', w: 30, d: 30, h: 28, color: '#ff8a3d', round: true, elev: 75 },
  { id: 'hutch', name: 'Clapier', emoji: '🐰', category: 'Animaux', w: 120, d: 60, h: 80, color: '#b08a64', model: 'doghouse' },
  { id: 'bowls', name: 'Gamelles', emoji: '🥣', category: 'Animaux', w: 40, d: 20, h: 8, color: '#7f9db5' },

  // Extérieur
  { id: 'olivetree', name: 'Olivier', emoji: '🌳', category: 'Extérieur', w: 250, d: 250, h: 350, color: '#9aab84', model: 'tree', round: true },
  { id: 'palm', name: 'Palmier', emoji: '🌴', category: 'Extérieur', w: 250, d: 250, h: 500, color: '#5f8a5a', model: 'tallplant', round: true },
  { id: 'hedge', name: 'Haie', emoji: '🟩', category: 'Extérieur', w: 300, d: 60, h: 150, color: '#5f8a5a' },
  { id: 'rosebush', name: 'Rosier', emoji: '🌹', category: 'Extérieur', w: 80, d: 80, h: 100, color: '#5f8a5a', round: true },
  { id: 'lavender', name: 'Lavande', emoji: '💜', category: 'Extérieur', w: 200, d: 50, h: 50, color: '#9b86c8' },
  { id: 'flowerbed', name: 'Massif de fleurs', emoji: '🌼', category: 'Extérieur', w: 200, d: 80, h: 40, color: '#f2c12e', model: 'lavender' },
  { id: 'veggie', name: 'Potager surélevé', emoji: '🥕', category: 'Extérieur', w: 200, d: 100, h: 50, color: '#8a6446' },
  { id: 'greenhouse', name: 'Serre', emoji: '🏡', category: 'Extérieur', w: 250, d: 200, h: 230, color: '#ffffff' },
  { id: 'shed', name: 'Cabane de jardin', emoji: '🛖', category: 'Extérieur', w: 220, d: 200, h: 240, color: '#8fa58a' },
  { id: 'pergola', name: 'Pergola', emoji: '⛩️', category: 'Extérieur', w: 350, d: 300, h: 250, color: '#efe9e0' },
  { id: 'hottub', name: 'Spa', emoji: '♨️', category: 'Extérieur', w: 200, d: 200, h: 90, color: '#8a6446' },
  { id: 'fountain', name: 'Fontaine', emoji: '⛲', category: 'Extérieur', w: 150, d: 150, h: 130, color: '#e6ddd0', round: true },
  { id: 'pond', name: 'Bassin', emoji: '🐸', category: 'Extérieur', w: 250, d: 170, h: 10, color: '#5aa7c8', round: true },
  { id: 'rocks', name: 'Rochers', emoji: '🪨', category: 'Extérieur', w: 120, d: 80, h: 50, color: '#a8a39b' },
  { id: 'snowman', name: 'Bonhomme de neige', emoji: '⛄', category: 'Extérieur', w: 60, d: 60, h: 150, color: '#ffffff', round: true },
  { id: 'car', name: 'Voiture', emoji: '🚗', category: 'Extérieur', w: 180, d: 420, h: 150, color: '#c98b8b' },
  { id: 'bicycle', name: 'Vélo', emoji: '🚲', category: 'Extérieur', w: 50, d: 175, h: 100, color: '#4f6f9a' },
  { id: 'mailbox', name: 'Boîte aux lettres', emoji: '📫', category: 'Extérieur', w: 40, d: 30, h: 120, color: '#e8b60f' },
  { id: 'tent', name: 'Tente', emoji: '🏕️', category: 'Extérieur', w: 200, d: 220, h: 130, color: '#e8822e' },
  { id: 'surfboard', name: 'Planche de surf', emoji: '🏄', category: 'Extérieur', w: 55, d: 30, h: 210, color: '#8fd0ea' },
  { id: 'gardenbench', name: 'Banc de jardin', emoji: '🪑', category: 'Extérieur', w: 150, d: 60, h: 85, color: '#8fa58a', model: 'sofa' },
  { id: 'deckchair', name: 'Chilienne', emoji: '🏖️', category: 'Extérieur', w: 60, d: 110, h: 90, color: '#e9c9c4', model: 'lounger' },
]

export const catalogItem = (id: string) => CATALOG.find((c) => c.id === id)
export const modelOf = (id: string) => catalogItem(id)?.model ?? id

export interface Material {
  id: string
  name: string
  kind: 'floor' | 'wall' | 'both'
  color: string
  pattern?: 'planks' | 'tiles' | 'herringbone' | 'checker' | 'grass' | 'none'
  roughness: number
}

export const MATERIALS: Material[] = [
  { id: 'oak', name: 'Parquet chêne clair', kind: 'floor', color: '#d4b48c', pattern: 'planks', roughness: 0.7 },
  { id: 'walnut', name: 'Parquet noyer', kind: 'floor', color: '#8a6446', pattern: 'planks', roughness: 0.6 },
  { id: 'whiteoak', name: 'Parquet blanchi', kind: 'floor', color: '#e6d9c5', pattern: 'planks', roughness: 0.7 },
  { id: 'herring', name: 'Point de Hongrie', kind: 'floor', color: '#c9a57a', pattern: 'herringbone', roughness: 0.65 },
  { id: 'tiles', name: 'Carrelage clair', kind: 'floor', color: '#e8e4dc', pattern: 'tiles', roughness: 0.4 },
  { id: 'checker', name: 'Damier noir et blanc', kind: 'floor', color: '#efeae2', pattern: 'checker', roughness: 0.35 },
  { id: 'terracotta', name: 'Tomettes', kind: 'floor', color: '#c8805f', pattern: 'tiles', roughness: 0.8 },
  { id: 'sage', name: 'Carreaux vert sauge', kind: 'floor', color: '#a9bba2', pattern: 'tiles', roughness: 0.45 },
  { id: 'concrete', name: 'Béton ciré', kind: 'floor', color: '#bdb8b0', pattern: 'none', roughness: 0.5 },
  { id: 'carpet', name: 'Moquette douce', kind: 'floor', color: '#d8cfc2', pattern: 'none', roughness: 1 },
  { id: 'pinkcarpet', name: 'Moquette rose', kind: 'floor', color: '#e9c9c4', pattern: 'none', roughness: 1 },
  { id: 'grass', name: 'Pelouse', kind: 'floor', color: '#8bab6c', pattern: 'grass', roughness: 1 },
  { id: 'deck', name: 'Terrasse en bois', kind: 'floor', color: '#a07a56', pattern: 'planks', roughness: 0.85 },
]

export const WALL_COLORS = ['#f4efe7', '#ffffff', '#e9d5cf', '#f2c9c0', '#dfe6dc', '#b9c9b2', '#dde4ec', '#9fb4c8', '#e8e3f3', '#efe2c8', '#e8c77a', '#c8805f', '#8fa58a', '#5b6b7a', '#2e2a26']
export const FURNITURE_COLORS = ['#ffffff', '#f3efe8', '#e8e1d6', '#c9b8a4', '#b08a64', '#8a6446', '#5b534b', '#2e2a26', '#e9c9c4', '#c98b8b', '#c8805f', '#e8b60f', '#8fa58a', '#5f8a5a', '#7f9db5', '#4f6f9a', '#a397c4']
