# Déploiement Vercel (Frontend & Backend réunis)

Ce projet est configuré pour se déployer en un **projet unique sur Vercel** hébergeant à la fois :
1. Le **Frontend Vite (React SPA)** servi à la racine (`/`).
2. Le **Backend Express** exécuté sous forme de Serverless Function Vercel sous `/api/*` via le point d'entrée `api/index.js`.

---

## 1. Architecture et Fichiers de Configuration

- **`vercel.json`** :
  - `installCommand` : installe les dépendances du frontend et du backend (`npm --prefix frontend ci && npm --prefix backend ci`).
  - `buildCommand` : compile le frontend Vite (`npm --prefix frontend run build`).
  - `outputDirectory` : définit `frontend/dist` comme répertoire statique.
  - `functions` : configure `api/index.js` avec `backend/**` et un `maxDuration` adapté.
  - `rewrites` :
    - Route toutes les requêtes `/api/:path*` vers la fonction Serverless `api/index.js`.
    - Route toutes les autres requêtes `/(.*)` vers `/index.html` (Single Page Application routing).
- **`package.json` (racine)** : déclare `"type": "module"` pour assurer la compatibilité ES Modules de la fonction Serverless.
- **`api/index.js`** : exporte l'application Express pour le runtime Node.js Vercel sans bloquer de port.
- **`.vercelignore`** : exclut les fichiers inutiles (`node_modules`, tests, `.env`, documentations).

---

## 2. Étapes de Déploiement

### Étape 1 : Importer le dépôt sur Vercel
1. Rendez-vous sur votre dashboard [Vercel](https://vercel.com).
2. Cliquez sur **Add New... → Project** et importez ce dépôt Git.
3. **Important** : Laissez le **Root Directory** par défaut (`./`). Ne sélectionnez ni `frontend` ni `backend`.
4. Vercel détectera automatiquement les commandes définies dans `vercel.json`.

### Étape 2 : Configurer les Variables d'Environnement
Dans **Settings → Environment Variables**, renseignez ces variables pour les environnements **Production** et **Preview** :

| Variable | Exemple / Description |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL (ex: Supabase, Neon, Neon connection pooling / pgBouncer recommandé pour le serverless) |
| `SESSION_SECRET` | Secret aléatoire d'au moins 32 caractères pour signer les sessions express |
| `BADGE_SECRET` | Secret stable d'au moins 32 caractères pour signer les badges QR |
| `FRONTEND_URL` | URL exacte du projet déployé (ex: `https://mon-projet.vercel.app`) |
| `TRUST_PROXY_HOPS` | `1` (pour faire confiance au proxy inverse de Vercel et valider les cookies `secure: true`) |
| `NODE_ENV` | `production` |

> **Astuce pour générer les secrets :**
> ```sh
> node -e "console.log(crypto.randomBytes(32).toString('hex'))"
> ```

### Étape 3 : Lancer le Déploiement
Cliquez sur **Deploy**. Vercel va :
1. Installer les modules pour `frontend` et `backend`.
2. Compiler le frontend avec Vite vers `frontend/dist`.
3. Packager la fonction Serverless Express `api/index.js`.

---

## 3. Migrations de la Base de Données

Les fonctions Serverless sont sans état (*stateless*). Les sessions et les données sont persistées dans PostgreSQL.
Avant la première utilisation, exécutez les migrations depuis une machine locale ou une console ayant accès à votre base :

```sh
cd backend
node migrate.js --horaires-creneaux
node migrate.js --pointages-organisation
node migrate.js --absences-organisation
node migrate.js --remove-matricule
```
