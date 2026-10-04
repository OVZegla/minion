export type ToolId =
  | 'move'
  | 'marquee-rect'
  | 'marquee-ellipse'
  | 'lasso'
  | 'lasso-poly'
  | 'wand'
  | 'crop'
  | 'eyedropper'
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'gradient'
  | 'bucket'
  | 'pen'
  | 'text'
  | 'direct'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'line'
  | 'hand'
  | 'zoom'

export interface ToolDef {
  id: ToolId
  label: string
  key: string // raccourci Photoshop
}

/** Groupes d'outils dans l'ordre de la barre d'outils de Photoshop. Maj + lettre alterne dans un groupe. */
export const TOOL_GROUPS: ToolDef[][] = [
  [{ id: 'move', label: 'Outil Déplacement', key: 'V' }],
  [
    { id: 'marquee-rect', label: 'Outil Rectangle de sélection', key: 'M' },
    { id: 'marquee-ellipse', label: 'Outil Ellipse de sélection', key: 'M' },
  ],
  [
    { id: 'lasso', label: 'Outil Lasso', key: 'L' },
    { id: 'lasso-poly', label: 'Outil Lasso polygonal', key: 'L' },
  ],
  [{ id: 'wand', label: 'Outil Baguette magique', key: 'W' }],
  [{ id: 'crop', label: 'Outil Recadrage', key: 'C' }],
  [{ id: 'eyedropper', label: 'Outil Pipette', key: 'I' }],
  [
    { id: 'brush', label: 'Outil Pinceau', key: 'B' },
    { id: 'pencil', label: 'Outil Crayon', key: 'B' },
  ],
  [{ id: 'eraser', label: 'Outil Gomme', key: 'E' }],
  [
    { id: 'gradient', label: 'Outil Dégradé', key: 'G' },
    { id: 'bucket', label: 'Outil Pot de peinture', key: 'G' },
  ],
  [{ id: 'pen', label: 'Outil Plume', key: 'P' }],
  [{ id: 'text', label: 'Outil Texte horizontal', key: 'T' }],
  [{ id: 'direct', label: 'Outil Sélection directe', key: 'A' }],
  [
    { id: 'rect', label: 'Outil Rectangle', key: 'U' },
    { id: 'ellipse', label: 'Outil Ellipse', key: 'U' },
    { id: 'polygon', label: 'Outil Polygone', key: 'U' },
    { id: 'line', label: 'Outil Trait', key: 'U' },
  ],
  [{ id: 'hand', label: 'Outil Main', key: 'H' }],
  [{ id: 'zoom', label: 'Outil Zoom', key: 'Z' }],
]

export const ALL_TOOLS = TOOL_GROUPS.flat()
export const toolDef = (id: ToolId) => ALL_TOOLS.find((t) => t.id === id)!
export const groupOf = (id: ToolId) => TOOL_GROUPS.find((g) => g.some((t) => t.id === id))!

/** Icônes dessinées pour Minion (formes simples, pas celles d'Adobe). */
const P: Record<ToolId, string> = {
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  'marquee-rect': 'M4 4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4M4 7V4',
  'marquee-ellipse': 'M12 5c-5 0-9 3-9 7s4 7 9 7 9-3 9-7-4-7-9-7z',
  lasso: 'M7 17c-3-1-4-4-3-7 2-5 9-6 13-4s4 7 0 9c-3 1-7 1-8 0M7 17c0 2 1 4 3 4',
  'lasso-poly': 'M4 18L6 6l8 3 6-4-2 10-6 1-4 4z',
  wand: 'M4 20L14 10M15 3v3M15 12v3M11 7h-3M22 7h-3M18 4l-2 2M18 10l-2-2',
  crop: 'M6 2v16h16M2 6h16v16',
  eyedropper: 'M14 4l6 6M17 7l-9 9-4 1 1-4 9-9M3 21l2-2',
  brush: 'M18 3l3 3-9 9-3-3zM9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 6 2 8 0 1-1 2-3 2-4',
  pencil: 'M16 3l5 5L9 20H4v-5zM13 6l5 5',
  eraser: 'M8 20h12M5 15l9-9 5 5-8 8H8z',
  gradient: 'M3 5h18v14H3zM7 5v14M11 5v14M15 5v14',
  bucket: 'M5 11l7-7 7 7-7 7zM19 11c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4M5 11h14',
  pen: 'M4 20l3-8 5-5 5 5-5 5zM12 7l2-4 7 7-4 2M4 20l6-6',
  text: 'M5 5V4h14v1M12 4v16M9 20h6',
  direct: 'M6 3v16l4-4 3 6 2.5-1-3-6H18z',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 6c-5 0-8 3-8 6s3 6 8 6 8-3 8-6-3-6-8-6z',
  polygon: 'M12 3l8 6-3 10H7L4 9z',
  line: 'M5 19L19 5',
  hand: 'M8 12V6a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v7V6a1.5 1.5 0 0 1 3 0v8c0 4-3 7-6 7-2 0-4-1-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 13',
  zoom: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M20 20l-4.5-4.5',
}

export function ToolIcon({ id, size = 18 }: { id: ToolId; size?: number }) {
  const filled = id === 'direct'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#fff' : 'none'} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[id]} />
    </svg>
  )
}
