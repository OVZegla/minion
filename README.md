# Minion

L'univers personnel d'Einat : notes, envies, projets, moodboards, calendrier, journal.

## Tester

Double-clic sur **`Lancer Minion.bat`** : l'app s'installe au premier lancement, puis s'ouvre dans le navigateur (http://localhost:5173). Fermer la fenêtre noire arrête l'app.

Ou en ligne de commande :

```bash
npm install
npm run dev
```

Astuce de développement : `http://localhost:5173/?nosplash` saute l'animation d'ouverture.

## Données

Tout est stocké localement dans le navigateur (IndexedDB), par navigateur et par adresse.
Réglages → « Sauvegarder dans un fichier » exporte tout (images comprises) ; « Restaurer » le réimporte.

## Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — choix techniques, modèle de données, écrans, direction artistique, distribution Windows
- [ROADMAP.md](ROADMAP.md) — ce qui est fait, ce qui reste
