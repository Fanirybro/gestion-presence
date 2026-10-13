# Présence - Frontend

Interface React 19 / TypeScript / Vite pour le système de gestion de présence du personnel par QR Code. Le projet utilise le dossier React existant, sans modifier le backend.

## Lancer

Depuis ce dossier :

```powershell
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 5175
```

Ouvrir http://127.0.0.1:5175. Sur Windows, `npm.cmd` évite les restrictions PowerShell sur `npm.ps1`.

## Démonstration

| Rôle | Identifiant | Mot de passe |
| --- | --- | --- |
| Coordinateur | coordinateur@presence.local | Presence2026! |
| Secrétaire | secretaire@presence.local | Presence2026! |

La page de connexion propose les deux comptes. Les données fictives sont initialisées au premier accès et conservées dans `localStorage` sous `presence-qr.demo.v1`. La session est propre à l'onglet (`sessionStorage`). Les changements de données sont synchronisés entre les onglets.

Les mots de passe et les droits du mode démo sont simulés côté navigateur : ne pas y saisir de véritables identifiants ni de données personnelles. Il ne s'agit pas d'une authentification de production.

Pour réinitialiser uniquement les données de cette application, supprimer les clés `presence-qr.demo.v1` et `presence-session` depuis les outils de développement du navigateur, puis recharger.

## Parcours disponibles

- Connexion, déconnexion, profil et changement du mot de passe.
- Tableau de bord, répartition par service et activité quotidienne.
- Personnel : recherche, filtres, tri, pagination, création, modification, activation et désactivation.
- Badges QR : génération, révocation/régénération, téléchargement PNG et impression.
- Pointage par caméra ou token QR : arrivée, départ, retard, erreurs, agent inactif, badge révoqué et protection contre les doubles scans.
- Présences, absences, retards et historique : filtres par date/période, service, agent et statut ; export CSV.
- Corrections réservées au coordinateur, justification d'absence par les deux rôles et journal des modifications avec motif.
- Rapports journaliers : prévisualisation, PDF, impression et archives conservant un instantané des données.
- Utilisateurs : création, rôles, activation/désactivation et réinitialisation de mot de passe.
- Paramètres : organisation, services, horaires par jour, tolérance et seuil d'absence.
- Routes protégées, page 403, page 404 et traitement des erreurs.

Les QR sont de véritables images générées avec `qrcode`, l'analyse caméra utilise `html5-qrcode`. La caméra nécessite HTTPS ou localhost et l'autorisation du navigateur. Les exports PDF sont générés localement avec jsPDF en mode démonstration. Les dates utilisent le fuseau `Indian/Antananarivo`.

## Organisation

```text
src/
  app/context.tsx       Session, données et notifications
  components/ui.tsx    Tables, champs accessibles, badges et dialogues
  layouts/             Navigation et cadre de l'application
  pages/               Écrans métier
  services/store.ts    Stockage et données de démonstration
  services/api.ts      Client HTTP préparé pour /api/v1
  types.ts             Contrats des données affichées
  utils.ts             Dates, retards et export CSV
tests/                 Parcours Playwright
```

## Branchement au backend

Le module **Personnel**, réservé au coordinateur, regroupe l’ajout, la modification, la suppression et l’accès aux badges QR (génération, téléchargement, impression et régénération). La suppression demande une confirmation : elle renseigne `deletedAt`, désactive l’agent et invalide son token. L’agent disparaît du référentiel courant ; ses informations restent conservées pour identifier les anciens pointages. Les relevés, scans et archives ne sont pas supprimés, et l’action est inscrite au journal. Un matricule déjà utilisé reste réservé, même après suppression.

Le frontend fonctionne actuellement **uniquement avec le stockage de démonstration**. Le client `services/api.ts` prépare les requêtes JSON, le jeton d'accès en mémoire et le renouvellement via cookie HttpOnly. Il n'est pas encore utilisé par les pages : renseigner `VITE_API_URL` ne suffit donc pas à basculer vers l'API.

Pour l'intégration, remplacer les lectures/mutations du contexte par les services REST et les hooks TanStack Query décrits dans le document d'architecture. Le serveur devra fournir l'authentification réelle, les autorisations, le traitement atomique et idempotent des scans, l'heure de référence, les absences automatiques, les tokens QR hachés et les PDF officiels. En démonstration, l'heure provient du navigateur et aucun job serveur n'est exécuté.

## Fluidité et chargements

Les neuf skills du pack [iart-ai/web-animation-skills](https://github.com/iart-ai/web-animation-skills) sont installés dans le dossier personnel Codex. Les recommandations de micro-interaction, performance, accessibilité et transitions sont appliquées à l'application React existante.

- Le cadre et la navigation restent montés lors des changements de page. Les écrans sont préchargés au survol ou au focus des liens du menu.
- Les skeletons de `components/Skeleton.tsx` couvrent le chargement initial des données, les pages différées, les tableaux et la génération des badges QR. Aucun délai artificiel n'est ajouté aux données de démonstration.
- PDF, génération QR et caméra chargent leurs bibliothèques à la demande. Les exports indiquent leur préparation et empêchent les doubles clics.
- `motion.css` et Motion assurent les retours de pression, transitions de page, indicateur actif, fenêtres et notifications. Les transitions gardent les dimensions du contenu et privilégient `transform` / `opacity`.
- Le menu mobile gère le focus, Échap et le blocage de l'arrière-plan. Les fenêtres restaurent le focus après fermeture. La préférence système de réduction des animations conserve les fondus courts et désactive les déplacements et le balayage des skeletons.

`tests/motion.spec.ts` simule des données et modules en attente, vérifie la continuité de la navigation, le clavier et le mode réduit, et contrôle une trace Chromium du balayage des skeletons pour détecter des événements Layout/Paint pendant l'animation.

## Espace secrétaire : Simple et Expert

Le mode Simple est proposé par défaut, avec quatre accès depuis l’accueil. Le sélecteur Simple / Expert reste disponible sur les pages de l’espace secrétaire. Le choix est conservé par identifiant de compte dans `localStorage` (`presence-ui-mode.v1.<id>`), indépendamment des données métier, et synchronisé entre les onglets. Il reste propre au navigateur utilisé.

Le mode Expert conserve le tableau de bord, les filtres, les exports, l’historique et la navigation complète. Le changement de mode conserve la route et le pointage en cours. Les fiches permettent aussi de sélectionner une période ; impression et PDF incluent les présences et absences déjà enregistrées, sans créer de relevés manquants. Les archives journalières existantes restent accessibles en Expert.

Les permissions restent identiques : la correction manuelle est réservée au coordinateur. L’accès « Ajouter un pointage » explique au secrétaire les informations à lui transmettre ; il n’enregistre pas de pointage ni de demande. Le scan et le backend ne sont pas modifiés.

Les tests `tests/secretary.spec.ts` couvrent les modes, leur persistance par compte, la continuité du scan, les permissions, les fiches par période, l’impression et les petits écrans.

## Vérifications des commandes

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run test:e2e
```

Les tests utilisent Microsoft Edge installé sur Windows et un serveur local sur le port 5175. Le serveur est démarré automatiquement par Playwright s'il n'existe pas. Ils vérifient les parcours métier, les rôles, les erreurs caméra et les débordements sur mobile. Les captures sont écrites dans `test-results/` (ignoré par Git). Le test de refus caméra simule l'erreur ; la lecture d'un badge par une caméra physique doit être vérifiée sur l'appareil cible.

`npm.cmd run format` applique le formatage des sources. `npm.cmd run build` produit le dossier `dist/`. L'hébergement doit rediriger les routes du frontend vers `index.html`.
