# Minion.com — Architecture & direction artistique

> Le compagnon de vie d'Einat : organiser ses envies, garder ses idées, explorer ses passions, créer et raconter sa vie.

Ce document décrit la cible. L'état réel d'avancement est tenu dans [`ROADMAP.md`](ROADMAP.md) — une fonctionnalité n'y est cochée que lorsqu'elle est utilisable et sauvegardée.

---

## 1. Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Application | **React 19 + TypeScript + Vite** | Rapide, typé, écosystème riche pour éditeurs et canvas. |
| Persistance | **IndexedDB via Dexie**, local-first | Données réellement persistées sur l'appareil, hors ligne, aucun serveur à maintenir. |
| Éditeur de notes | **TipTap** (ProseMirror) | Titres, listes, cases à cocher, citations, images, tableaux, liens. |
| Moodboards / plans | SVG + Pointer Events | Contrôle total de l'esthétique et des interactions. |
| Studio graphique | Canvas 2D (calques en mémoire), WebGL si nécessaire | Performances pour pinceaux et filtres. |
| Son (synthé) | Web Audio API | Préécoute et métronome. |
| 3D (étape 4) | three.js | Vue 3D/isométrique générée depuis le plan. |
| Export PDF | Feuilles d'impression dédiées + impression « Enregistrer en PDF » | Mise en page soignée et contrôlable. |
| Sauvegarde | Export / restauration JSON complet (images incluses) | Elle garde la main sur ses données. |

### Tester facilement (maintenant)

- `Lancer Minion.bat` : double-clic → installe si besoin, démarre et ouvre l'app dans le navigateur.
- Ou `npm run dev`.

### Distribution à Einat (plus tard) — installation simple, sans alerte

Point honnête : **aucun installateur `.exe` non signé ne passe proprement**. Windows SmartScreen affiche « Windows a protégé votre ordinateur » et certains antivirus le bloquent tant que l'exécutable n'a pas de réputation. Deux voies fiables :

1. **Application installable depuis le navigateur (PWA)** — recommandé pour commencer.
   L'app est hébergée (ex. Netlify / GitHub Pages, gratuit, HTTPS), Einat ouvre le lien dans Edge/Chrome et clique sur « Installer Minion ». Elle obtient une icône sur le bureau et dans le menu Démarrer, une fenêtre à part, un fonctionnement hors ligne. **Aucun `.exe`, donc aucune alerte antivirus.** Ses données restent sur son PC (IndexedDB).
2. **Installateur Windows signé** (Tauri ou Electron + NSIS, un clic, sans droits administrateur).
   Pour éviter les alertes il faut **signer** l'exécutable : *Azure Trusted Signing* (~10 $/mois, le moins cher et reconnu par SmartScreen) ou un certificat de signature de code classique. Sans signature, on peut seulement lui expliquer « Informations complémentaires → Exécuter quand même ».

L'app est construite pour que les deux voies restent possibles sans réécriture.

---

## 2. Modèle de données

Chaque contenu est une **entité** : `id` (UUID), `createdAt`, `updatedAt`, éventuellement `trashedAt` (corbeille avant suppression définitive).

```
Note         titre, contenu (JSON TipTap), couverture, icône, folderId, tags[], favori, inbox
Folder       nom, parentId, couleur
Wish         titre, description, image, catégorie, état (someday|exploring|doing|done),
             date?, groupe, ordre, souvenir { date, texte, photos[] }
Project      titre, intention, couverture, statut (colonnes personnalisables), dates?
Task         titre, fait, date?, projectId?
Event        titre, début, fin, journée entière, couleur, récurrence, rappels[], type
JournalEntry date, contenu, humeur?, moments[], fiertés[], réponses aux questions
Thought      texte, groupe?
Treasure     type (phrase|souvenir|victoire|image|bienfait), contenu, image?
Moodboard    titre, fond, éléments[] (image, texte, palette, lien, forme, note, matière)
Palette      nom, couleurs[]       (partagée moodboards / studio)
Asset        blob (image, pièce jointe), stocké une fois, référencé
Song         (étape 2) titre, tempo, mesure, sections, mesures, notes, doigtés
GraphicDoc   (étape 3) dimensions, calques, historique
RoomPlan     (étape 4) pièces, murs, ouvertures, meubles, lumières, variantes
Link         fromType, fromId, toType, toId     ← relations entre tous les contenus
Settings     thème, palette, blocs d'accueil (ordre), prénom
```

### Relations — une table `links` unique

Les contenus ne sont jamais copiés : une note reste dans sa bibliothèque et apparaît dans le projet, l'envie ou le moodboard qui la référence.

```
            ┌──────── Envie ────────┐
   idée ──► Note ◄──► Projet ◄──► Moodboard ◄── Palette ──► Studio
  (pensée)    ▲          │
              │          ▼ Tâches / étapes
         Morceau ◄── Événement (séance de synthé)
   Envie accomplie ──► Journal (souvenir)
```

Transformations : *pensée → note / tâche / envie*, *envie → projet* (l'envie reste sur le parchemin), *envie accomplie → souvenir du journal*.

---

## 3. Écrans

Navigation latérale calme (repliable), barre basse sur téléphone. Recherche globale `Ctrl+K`.

1. **Ouverture** — « Bonjour / Bonsoir Einat » écrit à l'encre + une phrase douce tirée au hasard.
2. **Accueil** — blocs choisis et ordonnés : aujourd'hui, capture rapide, récents, une envie, journal, moodboard mis en avant, reprendre un morceau.
3. **Bibliothèque** — boîte d'entrée, dossiers, tags, favoris, recherche ; éditeur plein écran.
4. **Mon parchemin** — vue parchemin + vue organisée.
5. **Moodboards** — galerie + canvas libre.
6. **Calendrier** — jour / semaine / mois + tâches sans date.
7. **Journal** — chronologie + calendrier, questions facultatives.
8. **Pensées à plat** & **Mon trésor**.
9. **Projets** — liste + tableau, fiche projet agrégeant les liens.
10. *(Étape 2)* **Atelier synthé**, **Apprendre**.
11. *(Étape 3)* **Atelier plume**, **Studio**.
12. *(Étape 4)* **Pièces & maisons**.
13. **Réglages** — thème, palette, accueil, sauvegarde / restauration.

*Réservé pour plus tard : la Boîte Loïc (rien n'est développé).*

### Studio graphique et atelier plume — fidèles à Photoshop

But : qu'Einat s'entraîne pour le vrai Photoshop. Le studio **reprend la disposition et les raccourcis de Photoshop**, avec des icônes dessinées pour Minion (pas les éléments graphiques d'Adobe) :

- Barre d'outils verticale à gauche, barre d'options d'outil en haut, panneaux à droite (Calques, Propriétés, Couleur, Historique), menus Fichier / Édition / Image / Calque / Sélection / Filtre / Affichage. Thème sombre gris comme Photoshop (le reste de Minion reste crème).
- Raccourcis Photoshop (Windows) : `V` déplacement, `M` sélection rectangulaire/elliptique, `L` lasso, `W` sélection rapide/baguette, `C` recadrage, `I` pipette, `B` pinceau, `E` gomme, `G` dégradé/pot de peinture, `T` texte, `P` plume, `A` sélection directe, `U` formes, `H` main, `Z` zoom, `Maj+lettre` pour alterner les outils d'un groupe, `X` permuter couleurs, `D` couleurs par défaut, `[` `]` taille du pinceau, `Ctrl+Z` / `Ctrl+Maj+Z` annuler/rétablir, `Ctrl+T` transformation, `Ctrl+J` dupliquer le calque, `Ctrl+Maj+N` nouveau calque, `Ctrl+G` grouper, `Ctrl+D` désélectionner, `Ctrl+A` tout sélectionner, `Ctrl+Maj+I` intervertir, `Ctrl+0` / `Ctrl+1` / `Ctrl++` / `Ctrl+-` zoom, `Espace` main temporaire, `Ctrl+L` niveaux, `Ctrl+M` courbes, `Ctrl+U` teinte/saturation, `Ctrl+S`, `Ctrl+Alt+Maj+W` exporter.
- La liste des fonctions réellement disponibles est affichée honnêtement (Aide → Fonctions disponibles).

L'**atelier plume** (jeu inspiré du principe du Bézier Game) utilise exactement la logique de la plume de Photoshop : clic = point d'angle, clic-glisser = point lisse avec poignées, `Maj` contraint à 45°, `Alt` (outil Conversion) casse/convertit les poignées, `Ctrl` (sélection directe temporaire) déplace points et poignées, clic sur le premier point pour fermer, `Ctrl+Z` annule le dernier point, `Échap`/`Entrée` termine le tracé.

---

## 4. Direction artistique

**Mots-clés** : papier crème, encre douce, lumière d'après-midi, carnet raffiné.

- **Fond** : crème `#FAF6EF`, surfaces `#FFFDF9`, encre `#2E2A26`.
- **Accents** (5 palettes au choix) : *Rose poudré* (défaut `#C98B8B`), *Sauge*, *Lavande*, *Terracotta*, *Bleu brume*.
- **Typographies** : *Fraunces* (titres), *Inter* (texte), *Caveat* avec parcimonie pour les annotations. Polices embarquées dans l'app (fonctionne hors ligne).
- **Formes** : rayons 14–20 px, ombres très diffuses et teintées, bordures 1 px à faible contraste.
- **Espaces** : grille de 8 px, marges généreuses.
- **Mouvement** : transitions 180–400 ms, courbe `cubic-bezier(.2,.8,.2,1)`, respect de `prefers-reduced-motion`.
- **Illustrations** : petits motifs SVG originaux, jamais envahissants.
- **Ton** : doux, jamais injonctif. Pas de statistiques de performance, pas de retard culpabilisant.

---

## 5. Principes de qualité

- Sauvegarde automatique avec état visible.
- Corbeille ; confirmation avant suppression définitive.
- Erreurs expliquées simplement.
- Journal privé par défaut.
- Outils de précision pour ordinateur et tablette ; téléphone = consultation, capture, calendrier, journal.
- Aucun bouton sans action : ce qui n'existe pas encore n'apparaît pas, ou apparaît clairement comme « bientôt ».
