# UX Boğa — Admin (Next.js + Tailwind v4)
```bash
cp .env.local.example .env.local
npm install && npm run dev   # http://localhost:3000
```
Design tokens (couleurs, rayons, thèmes dark/light) : `styles/tokens.css`, exposés dans `app/globals.css` → utilitaires `bg-surface`, `text-text-2`, `border-border`, `rounded-10`, `bg-accent`…

Une seule feuille de styles pour les deux espaces : tokens dans `styles/tokens.css`, couches et scope par espace (`<html data-ws>`) décrits dans `app/globals.css`.
Voir le README à la racine du projet.
