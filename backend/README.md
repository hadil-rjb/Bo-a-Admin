# UX Boğa — API (NestJS + MongoDB)
```bash
cp .env.example .env   # puis éditez JWT_SECRET et ADMIN_PASSWORD
npm install
npm run seed           # importe les articles existants
npm run dev            # http://localhost:4000/api
```
Auth : `POST /api/auth/login` → `{ token, user }`, puis `Authorization: Bearer <token>`.

| Méthode | Route | Rôle |
|---|---|---|
| POST | /auth/login | connexion (public) |
| GET/PATCH | /auth/me | profil, avatar, notifications |
| POST | /auth/password | changer le mot de passe |
| GET | /articles?q=&status=&cat=&full=1 | liste (`full=1` inclut le contenu HTML) |
| GET | /articles/summary | stats dashboard + alertes SEO |
| GET | /articles/categories | catégories distinctes |
| GET | /articles/calendar/2026-10 | articles du mois |
| GET/POST/PATCH/DELETE | /articles/:slug | CRUD |

## Compte admin automatique
Au démarrage, l'API crée l'admin défini par `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` s'il n'existe pas.
Le mot de passe d'un compte existant n'est jamais écrasé, sauf avec `ADMIN_FORCE_PASSWORD_SYNC=true` (récupération d'accès).
`JWT_SECRET` (16+ car.) est obligatoire ; 5 échecs de connexion bloquent l'IP/email 15 min.

## Google Search Console
1. Google Cloud Console → activer **Google Search Console API**.
2. *APIs & Services → Credentials → OAuth client ID* (type **Web application**) ; URI de redirection autorisée : `http://localhost:4000/api/gsc/callback` (+ votre URL de prod).
3. Écran de consentement : ajoutez votre compte Google comme *test user* tant que l'app n'est pas publiée.
4. Renseignez `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GSC_SITE` (`sc-domain:uxboga.com` ou `https://www.uxboga.com/`).
5. Dans l'admin → **Search Console → Connect**. Le compte Google choisi doit avoir accès à la propriété.

Routes : `GET /gsc/sites`, `PUT /gsc/site`, `GET /gsc/inspect?url=`, `GET /gsc/status`, `GET /gsc/auth-url`, `GET /gsc/callback` (public, protégé par `state`), `GET /gsc/performance?days=7|28|90|365`, `DELETE /gsc`.
Le refresh token est chiffré (AES-256-GCM, clé dérivée de `JWT_SECRET`) avant stockage ; scope en lecture seule.

### Partage / historique (`/api/share`)
| Méthode | Route | Rôle |
|---|---|---|
| GET | /share | membres, présence, lien (token visible par le propriétaire seulement) |
| POST | /share/members | owner — invite `{name,email,role}` → mot de passe temporaire (une fois) |
| PATCH / DELETE | /share/members/:id | owner — change le rôle / retire l'accès |
| PUT | /share/link | owner — `{enabled}` ou `{regenerate:true}` |
| POST | /share/ping | heartbeat de présence (aussi pour le lien, header `x-share-token`) |
| GET | /share/activity?kind=all\|article\|share\|open&before=&limit= | journal paginé |
| POST | /share/activity/:id/restore | owner / editor — restaure une version |

Les écritures sur `/articles` exigent `admin` ou `editor` ; connexion/déconnexion Search Console : `admin`.

### IA (`/api/ai`)
| Méthode | Route | Rôle |
|---|---|---|
| GET | /ai/settings | tous — fournisseur, modèles, clé masquée (`••••abcd`), brief |
| PUT | /ai/settings | owner — clés (vérifiées puis chiffrées), modèle, brief, langue |
| GET | /ai/models?provider=anthropic\|groq | owner — modèles réels du fournisseur |
| GET | /ai/ideas | tous — idées en attente |
| POST | /ai/ideas/generate | owner / editor — `{count?, focus?}` |
| POST | /ai/ideas/:id/article | owner / editor — `{date?}` → brouillon complet |
| DELETE | /ai/ideas/:id | owner / editor — écarter une idée |
| POST | /ai/cover-style/analyze | owner — analyse visuelle des dernières couvertures → guide de style |
| POST | /ai/cover-prompt | owner / editor — `{title, cat?, meta?, sub?, t?, text?}` → `{coverPrompt, alt, ratio, hasStyle}` |
| GET | /ai/image-models | owner — modèles text-to-image disponibles via Inference Providers |
| POST | /ai/cover-image | owner / editor — `{prompt, ratio?, seed?}` → `{image (data URL WebP), width, height, bytes, model, seed, ratio, match}` |
| POST | /media/cover | owner / editor — `{dataUrl}` → ré-encode en WebP, stocke, renvoie `{url}` |
| GET | /media/:id.webp | public — sert la couverture (cache 1 an) |

### Social Media (`/api/social`)
Espace Social Media (studio de designs, planner, brand kits) — collections `social_brands`, `social_designs`, `social_posts`, `social_workspaces`.
Lecture : tout utilisateur connecté · écriture : `admin` / `editor` · réinitialisation : `admin`. Pas d'accès par lien de partage.

| Méthode | Route | Rôle |
|---|---|---|
| GET | /social/workspace | espace complet `{ brands, data, active, set }` (ou `null`) |
| PATCH | /social/workspace | synchro incrémentale envoyée par le studio |
| PUT | /social/workspace | remplace tout (restauration d'une sauvegarde JSON) |
| DELETE | /social/workspace | admin — réinitialise (le studio recrée la démo) |
| GET / PATCH | /social/settings | marque active + réglages Social Media |
| GET / POST | /social/brands | liste (avec compteurs) / création `{ name, color? }` |
| GET / PATCH / DELETE | /social/brands/:brandId | |
| GET / POST | /social/brands/:brandId/designs | `?q=` · création `{ name, tpl?, ratio? }` |
| GET / PATCH / DELETE | /social/brands/:brandId/designs/:id | |
| GET / POST | /social/brands/:brandId/posts | `?from=YYYY-MM-DD&to=&status=` · création `{ d, date, time, pf }` |
| PATCH / DELETE | /social/brands/:brandId/posts/:id | |

`BODY_LIMIT` (défaut `50mb`) : taille max. des requêtes JSON (images en data URL dans les articles et les designs).
