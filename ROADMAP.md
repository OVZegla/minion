# Minion — feuille de route

Une case n'est cochée que si la fonction est utilisable **et** sauvegardée. Voir [`ARCHITECTURE.md`](ARCHITECTURE.md) pour la cible.

## Étape 1 — Socle personnel

- [x] Identité visuelle : papier crème, Fraunces / Inter / Caveat embarquées, 5 accents, ambiance Jour / Soir
- [x] Mascotte (icône de l'app) redessinée en vectoriel
- [x] Animation d'ouverture « Bonjour / Bonsoir Einat » + ~115 phrases douces tirées au hasard (+ ses propres phrases du trésor), désactivable
- [x] Navigation (barre latérale, barre basse sur téléphone), recherche globale `Ctrl+K`, capture rapide `Ctrl+Maj+I`
- [x] Accueil : blocs choisis et ordonnés (aujourd'hui, capture, récents, envie, journal, moodboard à la une, trésor, projets)
- [x] Notes : éditeur (titres, listes, cases, citations, images, tableaux, liens web, liens vers contenus), couverture, icône, dossiers, tags, favoris, filtre, corbeille + suppression définitive confirmée, export PDF (impression)
- [x] Boîte d'entrée + suggestions de classement (mots communs, sans IA, à accepter ou ignorer)
- [x] Mon parchemin : vue parchemin (groupes, glisser-déposer, 3 présentations), vue organisée (filtres, tri), fiche envie, souvenir (date, texte, photos) → journal, envie → projet (reste sur le parchemin), impression A4
- [x] Projets : liste, tableau à colonnes personnalisables (glisser-déposer), intention, couverture, dates facultatives, étapes/tâches, liens web, documents joints, galerie de créations, contenus reliés
- [x] Moodboards : modèles (libre, déco, voyage, identité visuelle, projet, envies), images (import + glisser depuis le bureau), texte, annotations, palettes, formes, matières, liens ; déplacer, redimensionner, pivoter, ordre des plans, alignement, guides magnétiques, sélection multiple, zoom, annuler/rétablir, verrouillage, fond, export PNG et PDF, palettes partagées, mise à la une
- [x] Calendrier : jour / semaine / mois, événements ponctuels et récurrents, types et couleurs, rappels (quand l'app est ouverte), déplacement à la souris, redimensionnement, « reporter à demain », « retirer cette fois », tâches avec ou sans date, tâches restées en chemin
- [x] Journal : privé, chronologie + calendrier, humeur facultative, questions facultatives, moments marquants, fiertés, photos, musique/lien, impression
- [x] Pensées à plat : dépôt libre, couleurs, regroupement, transformation en note / tâche / envie / projet, association à une envie
- [x] Mes petits bonheurs (onglet de Pensées à plat) : phrases, souvenirs, victoires, images, bienfaits ; explication claire ; tirage au hasard ; ses phrases rejoignent l’ouverture
- [x] Liens entre tous les contenus (table unique, sans copie)
- [x] Réglages : prénom, apparence, ouverture, catégories, types d'événements, sauvegarde / restauration dans un fichier, espace utilisé
- [x] Couleur du texte dans l’éditeur (10 couleurs) — notes, journal, fiches
- [x] Application installable depuis le navigateur (icône, fenêtre à part, hors ligne) — testée en local
- [x] En ligne sur GitHub Pages (https://ovzegla.github.io/minion/), installation en 1 clic, mises à jour automatiques
- [ ] Partage explicite d'une page de journal (volontairement absent : privé par défaut)

## Étape 2 — Musique et apprentissage
- [x] Atelier synthé : titre, tempo, mesure, notes et octaves, durées (pointées), silences, accords (notes empilées + accords chiffrés), mesures, mains droite/gauche, doigtés, annotations, sections
- [x] Saisie : clavier visuel, clavier d’ordinateur (adapté AZERTY/QWERTY), piano roll (ajout, déplacement, durée, sélection, copier/coller, dupliquer, transposer), opérations sur les mesures, annuler/rétablir
- [x] Présentations : piano roll, grille de notes, repères sur clavier, partition sur portée (clés de sol et fa, liaisons, silences, altérations)
- [x] Lecture : lecture/pause, curseur synchronisé, notes mises en évidence, métronome, décompte, boucle, départ à une mesure, tempo de pratique séparé, couper une main, préécoute (son de synthé simple)
- [x] Impression / PDF : choix du format, taille, mesures par ligne, doigtés, annotations, sauts de page
- [x] Reprendre un morceau depuis l’accueil ; séance de synthé du calendrier reliée à un morceau
- [x] Apprendre : séries reliées à des notes, cartes écrites ou proposées (règles simples, sans IA, passage source, « à vérifier »), fiche synthétique, révision espacée, quiz, texte à trous, à approfondir, informations manquantes signalées
- [ ] Reconnaissance d’un fichier audio (évolution séparée, jamais parfaite)

## Étape 3 — Création graphique
- [x] Atelier plume : 18 niveaux en 7 chapitres (segments → silhouette de la mascotte), outil plume fidèle à Photoshop (P, A, Ctrl, Alt, Maj, fermer, ajouter/supprimer des points, Espace pour déplacer le point), démonstration animée, indices, score et retour par segment, étoiles enregistrées
- [x] Atelier libre : modèle à décalquer, plusieurs tracés, export SVG, ouverture dans le studio
- [x] Studio graphique : disposition Photoshop (menus, barre d’options, outils avec groupes, panneaux Couleur/Nuancier/Propriétés/Calques/Historique), raccourcis Photoshop, plein écran (F) pour Ctrl+T / Ctrl+N
- [x] Calques pixel, texte, forme, groupes ; 16 modes de fusion ; opacité ; masques de fusion ; verrouillage ; réordonner ; fusionner ; aplatir
- [x] Sélections (rectangle, ellipse, lasso, polygonal, baguette magique, ajouter/soustraire/intersection, contour progressif, intervertir)
- [x] Pinceau, crayon, gomme, pot de peinture, dégradé, pipette, texte, formes, plume, déplacement, transformation, recadrage
- [x] Réglages (Niveaux, Courbes, Teinte/Saturation, Luminosité/Contraste, Seuil, Désaturation, Négatif) et filtres (Flou gaussien, Netteté, Bruit)
- [x] Historique, projet rééditable enregistré automatiquement, export PNG/JPEG, envoi vers un moodboard ou un projet, nuancier partagé
- [ ] Non prévu pour l’instant : PSD, calques de réglage, styles de calque, retouche (tampon, correcteur), IA générative, pression du stylet

## Étape 4 — Aménagement
- [x] Pièces de départ (chambre, salon, petit appartement) ou plan vide
- [x] Plan 2D : grille, accrochage (grille, extrémités, angles), cotations automatiques, outils Pièce / Mur / Porte / Fenêtre / Lumière, surfaces des pièces
- [x] 25 meubles et objets, déplacement, rotation (poignée, R), dimensions, couleurs, duplication ; matériaux de sol (parquets, point de Hongrie, carrelage, tomettes, béton ciré, moquette) ; couleurs des murs
- [x] Vue 3D générée depuis le plan : isométrique cadrée automatiquement (rotation par quarts de tour), vue libre, murs coupés, ambiance jour / soir, soleil et lampes réglables, ombres
- [x] Variantes enregistrées, export PNG du plan et de la 3D, plan PDF avec mention « non validé pour construire »
- [ ] Plus tard : escaliers, étages, meubles importés, image d’ambiance générée (sera identifiée comme telle)

## Plus tard
- [ ] Boîte Loïc (non développée, place réservée)
- [ ] Installateur Windows signé (voir ARCHITECTURE.md § Distribution)
