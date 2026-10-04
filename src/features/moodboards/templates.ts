import { uid } from '../../db/db'
import type { MoodItem } from '../../db/types'

type T = Omit<MoodItem, 'id' | 'z' | 'rotation'> & { rotation?: number }

export interface MoodTemplate {
  id: string
  name: string
  description: string
  background: string
  items: T[]
}

/** Modèles de départ : des emplacements doux à remplir avec ses images. */
export const TEMPLATES: MoodTemplate[] = [
  { id: 'libre', name: 'Composition libre', description: 'Une toile vierge.', background: '#fbf7f0', items: [] },
  {
    id: 'deco',
    name: 'Décoration',
    description: 'Une pièce, ses matières, ses couleurs.',
    background: '#f6f0e6',
    items: [
      { kind: 'text', x: 60, y: 40, w: 560, h: 70, text: 'Mon salon idéal', font: 'display', fontSize: 52, color: '#2e2a26' },
      { kind: 'shape', shape: 'arch', x: 60, y: 140, w: 360, h: 460, fill: '#e9d5cf' },
      { kind: 'shape', shape: 'rect', x: 450, y: 140, w: 300, h: 220, fill: '#e3ebdf' },
      { kind: 'shape', shape: 'rect', x: 450, y: 380, w: 300, h: 220, fill: '#efe6d8' },
      { kind: 'swatch', x: 790, y: 140, w: 150, h: 170, fill: '#d8c3a5', label: 'Bois clair' },
      { kind: 'swatch', x: 790, y: 330, w: 150, h: 170, fill: '#ece4d6', label: 'Lin' },
      { kind: 'palette', x: 60, y: 630, w: 520, h: 130, colors: ['#efe6d8', '#d8c3a5', '#a8876a', '#8fa58a', '#2e2a26'] },
      { kind: 'note', x: 620, y: 620, w: 260, h: 150, text: 'Lumière douce, plantes, tapis berbère', fill: '#fbf1c7', fontSize: 26, rotation: -2 },
    ],
  },
  {
    id: 'voyage',
    name: 'Voyage',
    description: 'Un endroit, des envies, des images.',
    background: '#eef3f6',
    items: [
      { kind: 'text', x: 60, y: 40, w: 600, h: 70, text: 'Destination…', font: 'display', fontSize: 56, color: '#2e3a44' },
      { kind: 'shape', shape: 'rect', x: 60, y: 140, w: 520, h: 360, fill: '#dfe8ef' },
      { kind: 'shape', shape: 'circle', x: 620, y: 150, w: 260, h: 260, fill: '#f4e2d8' },
      { kind: 'shape', shape: 'rect', x: 620, y: 440, w: 260, h: 200, fill: '#e3ebdf' },
      { kind: 'note', x: 60, y: 530, w: 280, h: 170, text: 'À voir :\n- \n- ', fill: '#fbf1c7', fontSize: 26, rotation: 2 },
      { kind: 'palette', x: 370, y: 560, w: 220, h: 120, colors: ['#7f9db5', '#dfe8ef', '#f4e2d8'] },
    ],
  },
  {
    id: 'identite',
    name: 'Identité visuelle',
    description: 'Logo, typographies, couleurs, ambiance.',
    background: '#ffffff',
    items: [
      { kind: 'text', x: 60, y: 40, w: 600, h: 70, text: 'Nom de la marque', font: 'display', fontSize: 54, color: '#2e2a26' },
      { kind: 'text', x: 60, y: 110, w: 600, h: 40, text: 'Valeurs · ton · univers', font: 'body', fontSize: 20, color: '#958b80' },
      { kind: 'shape', shape: 'circle', x: 60, y: 190, w: 220, h: 220, fill: '#f3e1df' },
      { kind: 'text', x: 320, y: 200, w: 420, h: 90, text: 'Aa Titre', font: 'display', fontSize: 72, color: '#2e2a26' },
      { kind: 'text', x: 320, y: 300, w: 420, h: 60, text: 'Aa Texte courant', font: 'body', fontSize: 32, color: '#5b534b' },
      { kind: 'palette', x: 60, y: 450, w: 680, h: 140, colors: ['#c98b8b', '#f3e1df', '#2e2a26', '#faf6ef', '#c9a46a'] },
      { kind: 'shape', shape: 'rect', x: 780, y: 190, w: 260, h: 400, fill: '#efe6d8' },
    ],
  },
  {
    id: 'projet',
    name: 'Projet personnel',
    description: 'Intention, références, prochaines étapes.',
    background: '#fbf7f0',
    items: [
      { kind: 'text', x: 60, y: 40, w: 600, h: 70, text: 'Mon projet', font: 'display', fontSize: 54, color: '#2e2a26' },
      { kind: 'note', x: 60, y: 140, w: 300, h: 180, text: 'Pourquoi j’en ai envie…', fill: '#f6dfe0', fontSize: 26, rotation: -2 },
      { kind: 'shape', shape: 'rect', x: 400, y: 140, w: 280, h: 280, fill: '#e8e3f3' },
      { kind: 'shape', shape: 'rect', x: 700, y: 140, w: 280, h: 280, fill: '#e3ebdf' },
      { kind: 'note', x: 60, y: 360, w: 300, h: 200, text: 'Prochaines étapes :\n1.\n2.', fill: '#fbf1c7', fontSize: 26, rotation: 1.5 },
      { kind: 'palette', x: 400, y: 450, w: 580, h: 120, colors: ['#a397c4', '#e8e3f3', '#8fa58a', '#fbf1c7'] },
    ],
  },
  {
    id: 'envies',
    name: 'Tableau d’envies',
    description: 'Ce que je veux vivre, en images.',
    background: '#fdf6f2',
    items: [
      { kind: 'text', x: 300, y: 40, w: 600, h: 80, text: 'Ce que je veux vivre', font: 'hand', fontSize: 64, color: '#a8676a' },
      { kind: 'shape', shape: 'rect', x: 60, y: 150, w: 300, h: 380, fill: '#f6d9cf', rotation: -3 },
      { kind: 'shape', shape: 'rect', x: 400, y: 150, w: 380, h: 260, fill: '#e3ebdf', rotation: 2 },
      { kind: 'shape', shape: 'rect', x: 820, y: 150, w: 300, h: 380, fill: '#e8e3f3', rotation: -1.5 },
      { kind: 'note', x: 430, y: 450, w: 320, h: 140, text: 'Un jour…', fill: '#fbf1c7', fontSize: 30 },
    ],
  },
]

export function instantiate(t: MoodTemplate): MoodItem[] {
  return t.items.map((it, i) => ({ ...it, id: uid(), z: i, rotation: it.rotation ?? 0 }))
}

export const BACKGROUNDS = ['#fbf7f0', '#ffffff', '#f6f0e6', '#fdf6f2', '#eef3f6', '#f1f5ee', '#f4f1f9', '#2e2a26', '#1f2a33']
