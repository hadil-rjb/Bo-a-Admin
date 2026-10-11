# UX Boğa Admin

| Dossier | Contenu |
|---|---|
| `backend/` | API NestJS + MongoDB (inchangée) |
| `frontend/` | **Nouveau** frontend Next.js 15 + Tailwind v4 (toutes les pages, données réelles) |
| `frontend-legacy/` | Ancien frontend HTML/JS, conservé comme référence |

## Lancer en local
```bash
# 1. Backend (port 4000)
cd backend && cp .env.example .env     # remplir les valeurs (JWT_SECRET, MONGODB_URI, ADMIN_*, GOOGLE_*, …)
npm i && npm run start:dev

# 2. Frontend (port 3000)
cd ../frontend && cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:4000/api
npm i && npm run dev
```
Dans `backend/.env` : `FRONTEND_URL=http://localhost:3000` et `CORS_ORIGIN=http://localhost:3000`
(retour OAuth Google → `/?connected=1`, redirigé vers Settings).

## Pages migrées
Login · Dashboard · Articles (liste + éditeur riche, couverture IA, Framer, popover de liens) · Calendar (semaine/mois, glisser-déposer, idées IA) ·
Search Console · Settings (Search Console, IA, Cover images, Framer, Appearance, Data) · Profile · Share (membres, lien public, présence) ·
Historique des versions · espace Chatbot Admin (« coming soon », comme l'original).

## Design
Tokens (couleurs, rayons, thèmes dark/light) dans `frontend/app/globals.css`, exposés en classes Tailwind : `bg-surface`, `text-text-2`, `border-border`, `rounded-10`, `bg-accent`…

## Déploiement
- Frontend : Vercel (ou `npm run build && npm start`), variable `NEXT_PUBLIC_API_URL` = URL publique de l'API (`https://api.exemple.com/api`).
- Backend : tout hébergeur Node (Render, Railway, VPS) + MongoDB Atlas. Mettre `FRONTEND_URL`/`CORS_ORIGIN` sur l'URL du frontend et `PUBLIC_API_URL` sur celle de l'API.
- Google OAuth : ajouter `<PUBLIC_API_URL>/gsc/callback` comme URI de redirection autorisée.
