import { MASCOT_SVG } from '../../components/Mascot'
import type { Anchor, Pt, VPath } from './bezier'

export const W = 800
export const H = 520

/** Lit un chemin SVG simple (M, L, C, Z en coordonnées absolues). */
export function parsePath(d: string, tf: (p: Pt) => Pt = (p) => p): VPath {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/gi) ?? []
  const anchors: Anchor[] = []
  let closed = false
  let i = 0
  const num = () => Number(tokens[i++])
  const pt = () => tf({ x: num(), y: num() })
  const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01
  while (i < tokens.length) {
    const cmd = tokens[i++].toUpperCase()
    if (cmd === 'M') {
      const p = pt()
      anchors.push({ ...p, hIn: null, hOut: null })
    } else if (cmd === 'L') {
      const p = pt()
      anchors.push({ ...p, hIn: null, hOut: null })
    } else if (cmd === 'C') {
      const c1 = pt()
      const c2 = pt()
      const p = pt()
      const prev = anchors[anchors.length - 1]
      prev.hOut = same(c1, prev) ? null : c1
      anchors.push({ ...p, hIn: same(c2, p) ? null : c2, hOut: null })
    } else if (cmd === 'Z') {
      closed = true
      const first = anchors[0]
      const last = anchors[anchors.length - 1]
      if (anchors.length > 1 && same(first, last)) {
        first.hIn = last.hIn
        anchors.pop()
      }
    }
  }
  return { anchors, closed }
}

export interface Level {
  id: string
  chapter: number
  title: string
  goal: string // une phrase : ce qu'il faut faire
  tips: string[] // explications courtes
  keys: string[] // raccourcis mis en avant
  target?: VPath
  start?: VPath // tracé de départ (niveaux « corriger »)
  showPoints?: boolean // indice affiché par défaut
  free?: boolean
}

export const CHAPTERS = ['Segments', 'Points d’ancrage', 'Courbes', 'Poignées', 'Formes fermées', 'Silhouettes', 'Tracés libres']

const mascotBody = (() => {
  const d = MASCOT_SVG.match(/class="m-body"[^>]*d="([^"]+)"/)?.[1] ?? ''
  return parsePath(d, (p) => ({ x: (p.x - 200) * 0.48 + 195, y: (p.y - 130) * 0.48 + 20 }))
})()

export const LEVELS: Level[] = [
  // 1. Segments
  {
    id: 's1', chapter: 0, title: 'Un premier segment', showPoints: true,
    goal: 'Relie les deux points par une ligne droite.',
    tips: ['Avec la plume (P), un clic pose un point d’ancrage.', 'Un deuxième clic pose le point suivant : un segment droit les relie.', 'Appuie sur Échap ou Entrée pour terminer le tracé.'],
    keys: ['P', 'Clic', 'Échap'],
    target: parsePath('M 200 260 L 600 260'),
  },
  {
    id: 's2', chapter: 0, title: 'Zigzag', showPoints: true,
    goal: 'Trace la ligne brisée en cliquant sur chaque point.',
    tips: ['Clique simplement, sans glisser : chaque point est un angle net.', 'Une erreur ? Ctrl + Z retire le dernier point.'],
    keys: ['Clic', 'Ctrl+Z'],
    target: parsePath('M 140 340 L 260 160 L 400 340 L 540 160 L 660 340'),
  },
  {
    id: 's3', chapter: 0, title: 'Angles parfaits', showPoints: true,
    goal: 'Monte l’escalier, en finissant par la diagonale.',
    tips: ['Maintiens Maj en cliquant : le segment se cale sur 0°, 45° ou 90°.', 'Très utile pour des lignes parfaitement droites.'],
    keys: ['Maj + Clic'],
    target: parsePath('M 180 410 L 180 320 L 300 320 L 300 230 L 420 230 L 420 140 L 540 140 L 640 240'),
  },
  // 2. Points d'ancrage
  {
    id: 'a1', chapter: 1, title: 'Fermer une forme', showPoints: true,
    goal: 'Dessine le triangle et ferme-le.',
    tips: ['Pour fermer, reviens cliquer sur le tout premier point.', 'Juste avant, le curseur affiche un petit rond « o ».'],
    keys: ['Clic sur le 1er point'],
    target: parsePath('M 400 110 L 620 400 L 180 400 Z'),
  },
  {
    id: 'a2', chapter: 1, title: 'Remettre d’aplomb', showPoints: true,
    goal: 'Deux coins sont mal placés : déplace-les pour retrouver le rectangle.',
    tips: ['La sélection directe (A) déplace un point d’ancrage.', 'Avec la plume, maintiens Ctrl pour l’avoir temporairement, comme dans Photoshop.', 'Maj pendant le déplacement garde une direction droite.'],
    keys: ['A', 'Ctrl + glisser'],
    target: parsePath('M 220 120 L 580 120 L 580 400 L 220 400 Z'),
    start: parsePath('M 220 120 L 650 175 L 580 400 L 160 330 Z'),
  },
  {
    id: 'a3', chapter: 1, title: 'Le toit', showPoints: true,
    goal: 'Transforme le rectangle en maison : ajoute un point au milieu du haut et monte-le.',
    tips: ['Avec la plume, survole un segment : le curseur affiche « + ». Clique pour ajouter un point.', 'Survole un point existant : « − » le supprime.', 'Puis Ctrl + glisser pour monter le nouveau point.'],
    keys: ['Plume sur un segment (+)', 'Ctrl + glisser'],
    target: parsePath('M 220 200 L 400 90 L 580 200 L 580 420 L 220 420 Z'),
    start: parsePath('M 220 200 L 580 200 L 580 420 L 220 420 Z'),
  },
  // 3. Courbes
  {
    id: 'c1', chapter: 2, title: 'Une arche', showPoints: true,
    goal: 'Trace l’arche avec deux points seulement.',
    tips: ['Clique-glisse : tu tires des poignées qui donnent la direction de la courbe.', 'Sur le 1er point, glisse vers le haut (là où la courbe part).', 'Sur le 2e point, glisse vers le bas : la courbe arrive d’en haut.'],
    keys: ['Clic-glisser'],
    target: parsePath('M 200 360 C 200 140 600 140 600 360'),
  },
  {
    id: 'c2', chapter: 2, title: 'La vague en S', showPoints: true,
    goal: 'Dessine le S avec trois points.',
    tips: ['Au point du milieu, glisse dans le sens où la courbe continue.', 'Plus tu tires loin, plus la courbe est ample.'],
    keys: ['Clic-glisser'],
    target: parsePath('M 160 390 C 160 150 400 150 400 270 C 400 390 640 390 640 150'),
  },
  {
    id: 'c3', chapter: 2, title: 'Les vagues', showPoints: true,
    goal: 'Enchaîne les vagues, un point par croisement.',
    tips: ['Garde un rythme régulier : même longueur de poignée à chaque point.', 'Tu peux corriger une poignée ensuite avec Ctrl + glisser.'],
    keys: ['Clic-glisser', 'Ctrl'],
    target: parsePath('M 100 260 C 150 140 250 140 300 260 C 350 380 450 380 500 260 C 550 140 650 140 700 260'),
  },
  // 4. Poignées
  {
    id: 'h1', chapter: 3, title: 'Les écailles', showPoints: true,
    goal: 'Trace les trois bosses : chaque point est une pointe.',
    tips: ['Pour une pointe, les deux poignées ne sont pas alignées.', 'Clique-glisse, puis appuie sur Alt sans lâcher : la poignée de sortie bouge seule.', 'Avec la plume, Alt + glisser une poignée existante la déplace aussi seule.'],
    keys: ['Clic-glisser + Alt'],
    target: parsePath('M 140 340 C 140 200 300 200 300 340 C 300 200 460 200 460 340 C 460 200 620 200 620 340'),
  },
  {
    id: 'h2', chapter: 3, title: 'La lettre D', showPoints: true,
    goal: 'Dessine le D : une courbe, puis un trait droit pour fermer.',
    tips: ['Après une courbe, Alt + clic sur le dernier point coupe sa poignée.', 'Le segment suivant repart alors bien droit.', 'Alt + clic sur un point arrondi le transforme en angle.'],
    keys: ['Alt + clic sur le point'],
    target: parsePath('M 300 110 C 610 110 610 410 300 410 L 300 110 Z'),
  },
  // 5. Formes fermées
  {
    id: 'f1', chapter: 4, title: 'Le cercle', showPoints: true,
    goal: 'Un cercle parfait avec quatre points.',
    tips: ['Place les points en haut, à droite, en bas et à gauche.', 'Glisse toujours dans le même sens de rotation, horizontal ou vertical selon le point.', 'Ferme en clic-glissant sur le premier point pour garder la courbe douce.'],
    keys: ['Maj + glisser', 'Fermer'],
    target: parsePath('M 400 100 C 488.4 100 560 171.6 560 260 C 560 348.4 488.4 420 400 420 C 311.6 420 240 348.4 240 260 C 240 171.6 311.6 100 400 100 Z'),
  },
  {
    id: 'f2', chapter: 4, title: 'La goutte', showPoints: false,
    goal: 'Une goutte : pointue en haut, ronde en bas.',
    tips: ['Commence par la pointe avec un simple clic.', 'Les autres points sont arrondis.', 'Indice : le bouton « Montrer les points » t’aide si besoin.'],
    keys: ['Clic', 'Clic-glisser'],
    target: parsePath('M 400 90 C 400 90 560 260 560 330 C 560 418 488 470 400 470 C 312 470 240 418 240 330 C 240 260 400 90 400 90 Z'),
  },
  {
    id: 'f3', chapter: 4, title: 'La feuille', showPoints: false,
    goal: 'Une feuille : deux pointes et deux courbes.',
    tips: ['Les deux pointes ont des poignées cassées (Alt).', 'Deux points suffisent !'],
    keys: ['Alt', 'Fermer'],
    target: parsePath('M 200 360 C 260 180 460 120 620 160 C 580 320 400 420 200 360 Z'),
  },
  // 6. Silhouettes
  {
    id: 'x1', chapter: 5, title: 'Le cœur', showPoints: false,
    goal: 'Dessine le cœur.',
    tips: ['Deux pointes (en haut au centre et en bas), le reste arrondi.', 'Observe où la courbe change de direction : c’est là qu’on met les points.'],
    keys: ['Alt', 'Ctrl'],
    target: parsePath('M 400 180 C 400 120 330 90 280 110 C 210 140 200 230 260 300 C 310 360 380 410 400 440 C 420 410 490 360 540 300 C 600 230 590 140 520 110 C 470 90 400 120 400 180 Z'),
  },
  {
    id: 'x2', chapter: 5, title: 'Le nuage', showPoints: false,
    goal: 'Un nuage moelleux, avec une base droite.',
    tips: ['Chaque bosse commence et finit par une pointe.', 'La base : Alt + clic sur le dernier point, puis ferme.'],
    keys: ['Alt', 'Fermer'],
    target: parsePath('M 200 360 C 140 360 130 280 190 260 C 180 190 260 160 310 200 C 330 130 450 120 480 190 C 520 150 610 170 600 240 C 660 250 670 360 590 360 Z'),
  },
  {
    id: 'x3', chapter: 5, title: 'La mascotte', showPoints: false,
    goal: 'Le grand défi : la silhouette de la mascotte de Minion.',
    tips: ['Prends ton temps, point par point.', 'Tu peux tout ajuster après avec Ctrl.', `Le modèle utilise ${mascotBody.anchors.length} points.`],
    keys: ['Tout ce que tu as appris'],
    target: mascotBody,
  },
  // 7. Tracés libres
  {
    id: 'free', chapter: 6, title: 'Atelier libre', free: true,
    goal: 'Dessine ce que tu veux, ou décalque une image.',
    tips: ['Importe une image comme modèle et décalque-la.', 'Exporte ton tracé en SVG, utilisable dans d’autres logiciels.'],
    keys: ['P', 'A', 'Ctrl', 'Alt', 'Maj'],
  },
]

/** Score de ressemblance (0–100) à partir de la distance moyenne en pixels. */
export const scoreFrom = (meanDist: number) => Math.max(0, Math.min(100, Math.round(100 - meanDist * 5.5)))
export const starsFrom = (score: number) => (score >= 85 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0)
