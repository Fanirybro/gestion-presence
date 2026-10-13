# API Présence

Node.js 24 et PostgreSQL 14+ sont nécessaires. Configurer `.env` depuis
`.env.example`, puis lancer `npm start` (ou `node index.js`). Le fichier `.env`
est chargé automatiquement ; les variables système restent prioritaires.

## Mise à jour d'une base existante

Après sauvegarde habituelle de la base, exécuter depuis `backend` :

```sh
npm run migrate
```

La commande utilise maintenant `database/migrations/20261002_organisation_members.sql`,
prévue pour la nouvelle structure fournie (`users` sans rôle ni organisation,
`organisation_members` avec rôle et statut, code d'organisation de type integer).
Elle ajoute les index uniques sur email, code et couple organisation/utilisateur.
Elle ne convertit ni ne supprime les données ; en présence de doublons, elle
échoue et annule la transaction. L'ancienne migration du 01/10 ne doit plus
être exécutée sur cette structure. Le fichier de contexte fourni n'est pas
un script d'installation. `database/schema.sql` reste un schéma pour base vide.

## Compte, session et organisation

| Route | Accès et comportement |
| --- | --- |
| `POST /api/auth/signup` | Crée un compte sans organisation et ouvre la session |
| `POST /api/auth/login` | Vérifie les identifiants et ouvre la session |
| `GET /api/auth/me` | Compte courant, y compris sans organisation |
| `POST /api/auth/logout` | Détruit la session ; corps JSON `{}` |
| `POST /api/organisations` | Compte connecté sans organisation : crée et devient coordinateur |
| `POST /api/organisations/join` | Compte connecté sans organisation : rejoint comme secrétaire |
| `GET /api/organisations/me` | Organisation et code du compte connecté |
| `PATCH /api/organisations/me` | Modification réservée au coordinateur |
| `/api/users` | Gestion des utilisateurs réservée au coordinateur avec organisation |

Inscription : `{ "nom": "Rakoto", "prenom": "Alice", "email": "alice@example.com", "password": "un-secret-a-remplacer" }`.
Le mot de passe contient 12 à 128 caractères et est haché avec scrypt.
Les champs rôle et organisation ne sont jamais acceptés à l'inscription.

Créer : `{ "nom": "Mon équipe" }` ; `slug`, `adresse`, `fuseau_horaire` sont
facultatifs. Le fuseau par défaut est `Indian/Antananarivo`. Le slug et le code
numérique aléatoire de 9 chiffres sont générés côté serveur. Le compte existant est
inscrit dans `organisation_members` dans la même transaction :
`user_id` = compte connecté, `organisation_id` = organisation créée,
`role = COORDINATOR`, `status = ACTIVE`. Si cette insertion échoue,
l'organisation n'est pas conservée. L'ancien corps avec `coordinateur` n'est
plus utilisé : il faut d'abord créer un compte.

Rejoindre : `{ "organisation_code": "582394107" }`. Un code invalide
ou une organisation inactive ne permet pas de rejoindre. Un compte déjà lié
ne peut ni créer ni rejoindre un autre espace (409). Les rôles sont attribués
par le serveur : création = coordinateur actif ; adhésion par code = secrétaire actif
(comportement d'accès immédiat conservé). Une adhésion existante, y compris
rejetée, n'est pas remplacée silencieusement. Les lignes PENDING et REJECTED
ne donnent jamais de permissions.

La session conserve l'utilisateur et l'organisation sélectionnée. Connexion,
`/auth/me` et permissions consultent les adhésions ACTIVE à chaque requête.
Sans adhésion active, l'API retourne `organisation_id: null` et `role: null`.
L'application conserve le parcours d'une organisation courante ; elle ne
propose pas encore de sélecteur multi-organisation. Si plusieurs adhésions
actives préexistent, la première par identifiant est sélectionnée à la connexion.

Les contrôleurs utilisateurs lisent et modifient les rôles dans les adhésions.
`PATCH /api/users/:id/status` active ou rejette l'adhésion de l'organisation
courante, sans désactiver globalement le compte. La protection du dernier
coordinateur actif est conservée.

Les sessions PostgreSQL sont dans `http_sessions`, créée automatiquement au
premier accès. Le compte PostgreSQL doit avoir le droit de créer cette table.
Expiration : sept jours d'inactivité. Cookies HttpOnly, SameSite=Lax et Secure
en production (HTTPS nécessaire). Configurer `TRUST_PROXY_HOPS` seulement
selon les reverse proxies réellement utilisés.

Le frontend utilise `credentials: include`. Vite transmet `/api` vers
`http://localhost:3000`. En production, configurer le proxy ou `VITE_API_URL`
et `FRONTEND_URL` ; frontend et API doivent appartenir au même site.
Les mutations utilisent du JSON et une origine autorisée.

Les limites de tentatives sont en mémoire par processus ; un déploiement
multi-instance doit partager ce compteur. `requireAuth` recharge le compte,
`requireOrganisation` exige une organisation et `requireRole` vérifie le rôle.

## Personnel et départements

Les tables `personnel`, `departements`, `organisation_members`, `badges` et
`journal_audit` du schéma fourni sont utilisées sans migration supplémentaire.
Toutes les lectures sont limitées à l'organisation de la session. Les mutations
sont réservées au coordinateur actif et exécutées dans une transaction avec audit.

| Route | Comportement |
| --- | --- |
| `GET /api/personnels` | Liste du personnel de l'organisation, actif et inactif |
| `GET /api/personnels/:id` | Fiche d'un agent de l'organisation |
| `POST /api/personnels` | Création d'un agent |
| `PATCH /api/personnels/:id` | Modification partielle, activation ou désactivation |
| `GET /api/personnels/membres` | Comptes de l'organisation disponibles pour le rattachement, coordinateur uniquement |
| `GET /api/departements` | Départements actifs et inactifs de l'organisation |
| `POST /api/departements` | Création avec `{ "nom": "Administration" }` |
| `PATCH /api/departements/:id` | Renommage et changement du booléen `actif` |

Corps de création d'un agent :

```json
{
  "nom": "Rakoto",
  "prenom": "Alice",
  "date_naissance": "1995-04-12",
  "departement_id": "4",
  "utilisateur_id": null,
  "poste": null,
  "date_embauche": null,
  "actif": true
}
```

Les identifiants bigint sont des chaînes JSON. L'organisation est toujours issue
de la session, jamais du formulaire. Les dates restent au format `YYYY-MM-DD`.
La naissance ne peut pas être future dans le fuseau de l'organisation et
l'embauche ne peut pas précéder la naissance. Le compte lié est unique dans l'organisation. Un nouveau rattachement exige un département
actif et, si renseigné, un utilisateur membre actif de la même organisation.

La désactivation (`PATCH` avec `{ "actif": false }`) conserve l'agent et son
historique et révoque ses badges actifs. La réactivation ne restaure pas les
badges révoqués. Un département contenant des agents actifs ne peut pas être
désactivé. Il n'existe pas de suppression physique dans cette API.

Les pages Personnel et la section Départements des paramètres lisent et écrivent
via l'API. Elles affichent les erreurs serveur et empêchent les doubles envois.
Les données de personnel locales ne sont plus utilisées comme référentiel.
La création d'un personnel actif génère automatiquement son badge dans la même
transaction. Si la génération échoue, la création du personnel est annulée.
Les badges QR sont accessibles depuis la liste et la fiche du personnel.
Le coordinateur peut générer, télécharger en PNG, imprimer, régénérer ou révoquer
un badge. La planche prépare les badges des agents actifs et conserve les codes
existants. La régénération invalide immédiatement l'ancien code.

### Badges et pointages QR

`GET/POST /api/badges/personnel/:id` lit ou crée le badge ; le POST accepte
`{ "regenerate": true }`. `POST /api/badges/personnel/:id/revoke` le révoque.
`POST /api/badges/prepare` prépare les badges actifs pour l'impression groupée.
Ces opérations sont réservées au coordinateur de l'organisation.

`POST /api/badges/scan` reçoit `{ token, cle_idempotence }` (UUID v4) et alterne
arrivée/départ pour les membres actifs. Le serveur vérifie le badge, le personnel,
l'organisation, les horaires et un délai de 60 secondes entre deux pointages.
Il enregistre atomiquement l'événement dans `pointages` et la synthèse dans
`presences_journalieres`. Le soir après minuit reste rattaché au jour de début.
`GET /api/badges/events` recharge les synthèses et les 100 derniers scans QR.
La page Scan utilise ces routes pour la caméra comme pour la saisie manuelle.

La base conserve uniquement le hash du jeton. La réimpression utilise une clé
stable `BADGE_SECRET` (au moins 32 caractères), ou `SESSION_SECRET` par défaut.
Un changement de cette clé exige de régénérer les badges concernés.

Pour les bases dont `pointages` ne contient pas encore l'organisation :

```sh
node migrate.js --pointages-organisation
```

La migration `20261008_pointages_organisation.sql` reprend l'organisation depuis
le personnel, ajoute les références et l'unicité de la clé d'idempotence par
organisation, sans supprimer de pointages. Toute incohérence annule la migration.
`node scripts/check-pointages-migration.js` vérifie son application et sa
réexécution sur des tables temporaires, puis annule les données de test.

`node --test tests/badges.test.js` couvre les routes avec une base simulée.
Depuis `frontend`, `npx playwright test badges.spec.ts` vérifie les badges,
leur téléchargement, leur régénération, leur révocation et le scan avec API simulée.

### Vérifications du personnel

`node --test` inclut les tests HTTP du personnel (base simulée).
Depuis `frontend`, `npx playwright test personnel.spec.ts auth.spec.ts` vérifie
le parcours de gestion et la connexion avec des réponses API simulées.
La vérification des colonnes de la base distante a été faite en lecture seule ;
les tests n'y créent pas de personnel.

## Vérifications générales

### Paramètres et horaires de travail

`GET /api/parametres` retourne `{ organisation, horaires }` pour l'organisation
de la session. `PATCH /api/parametres`, réservé au coordinateur, reçoit
`{ nom, adresse, horaires }` et sauvegarde l'organisation, les 21 créneaux et
l'audit dans une seule transaction. Chaque jour contient `MATIN`, `APRES_MIDI`
et `SOIR`, activables indépendamment. Chaque horaire contient `jour_semaine`
(0 = dimanche, 6 = samedi), `periode`, `fin_jour_suivant`, `jour_travaille`,
`heure_debut`, `heure_fin`, `heure_limite_absence` et `tolerance_retard_minutes`.
Les heures sont au format `HH:MM`, ou `null` pour les créneaux non travaillés.

`fin_jour_suivant: true` est autorisé uniquement pour un créneau SOIR actif :
18:00–02:00 représente un créneau de 8 heures, rattaché au jour de début.
Dans ce cas, un seuil inférieur à l'heure de début (par exemple 00:30) est
interprété le lendemain. Chaque créneau dure moins de 24 heures. Le seuil se
situe entre la fin de tolérance et la fin du créneau. L'API refuse les doublons,
les périodes inconnues et les chevauchements, y compris entre deux jours et
entre le samedi soir et le dimanche matin. Les créneaux actifs suivent l'ordre
matin, après-midi, soir ; aucune heure de coupure fixe n'est imposée.

Pour une base existante, lancer depuis `backend` :

```sh
node migrate.js --horaires-creneaux
```

La migration `20261005_horaires_creneaux.sql` conserve les anciennes heures
sous MATIN, ajoute les autres périodes inactives et remplace l'unicité par
`(organisation_id, jour_semaine, periode)`. Elle est transactionnelle et
réexécutable. Il faut répartir manuellement les anciennes journées complètes
entre les créneaux souhaités. Le script `node scripts/check-horaires-migration.js`
teste cette migration sur une table temporaire, sans modifier les données métier.

Le formulaire Paramètres et les horaires utilisés par les autres écrans sont
alimentés par cette API, et non par le localStorage. Les anciens horaires locaux
ne sont pas importés automatiquement. Tant que la semaine n'est pas configurée
en base, les jours manquants apparaissent non ouvrés avec un message invitant à
les configurer. Le fuseau horaire affiché est celui de l'organisation et reste
en lecture seule dans ce formulaire.

Les calculs locaux de retard sélectionnent maintenant le créneau de l'arrivée,
y compris la suite du soir précédent après minuit. Les synthèses de présence
restent journalières : cette évolution du paramétrage ne crée pas trois fiches
de présence ni trois couples arrivée/départ par jour.

`npx playwright test settings.spec.ts` vérifie les trois créneaux, la fin le
lendemain, l'enregistrement, le rechargement et la conservation des saisies en
cas d'erreur, avec une API simulée. `node --test unit/schedules.test.ts` vérifie
la sélection des créneaux et le calcul des retards côté frontend.

`npm run diagnose` : affiche chaque étape et son résultat dans le terminal backend
(configuration, DNS, TCP, connexion PostgreSQL, colonnes et permissions).
Cette commande ne crée aucun compte et ne modifie pas la base.
Les requêtes signup affichent aussi leur progression et le statut HTTP final,
avec un identifiant pour distinguer les requêtes simultanées. Les mots de passe,
emails, cookies et paramètres SQL ne sont pas journalisés. Une connexion à la
base qui ne répond pas échoue après 10 secondes.

`npm test` : tests HTTP avec PostgreSQL simulé et sessions en mémoire.
Frontend : `npm run build`, `npm run lint` et
`npx playwright test auth.spec.ts` depuis `frontend`.
Les anciens tests de démonstration basés sur le choix manuel du rôle ne
correspondent plus au parcours de connexion réel.

## Présences, retards et absences

`GET /api/presences?start=YYYY-MM-DD&end=YYYY-MM-DD` retourne les relevés de
l'organisation et matérialise les absences journalières arrivées au dernier seuil
d'absence configuré. Un congé actif devient une absence justifiée. Une arrivée QR
ou corrigée est classée `PRESENT` ou `LATE` par rapport au créneau concerné, sa
tolérance et, pour le soir, le jour de début du créneau.

`GET /api/presences/:id` retourne le relevé et son journal. Le coordinateur peut
le corriger avec `PATCH /api/presences/:id` ou justifier une absence avec
`POST /api/presences/:id/justify`. Chaque opération exige un motif et la version
du relevé ; elle est refusée si une autre personne l'a modifié entre-temps.

Les congés et permissions utilisent `GET/POST /api/absences-autorisees`,
`PATCH /api/absences-autorisees/:id` et
`POST /api/absences-autorisees/:id/cancel`. Les modifications sont réservées au
coordinateur, restent dans l'organisation et sont auditées. Les permissions sont
sur une seule journée ; les chevauchements sont refusés.

Pour une base existante, exécuter une fois depuis `backend` :

```sh
node migrate.js --absences-organisation
```

La migration ajoute `organisation_id` aux absences existantes depuis le personnel
et ajoute les références nécessaires, sans supprimer d'enregistrement.

L'authentification, les organisations, le personnel, les départements, les horaires,
les badges, les scans, les présences et les absences autorisées utilisent l'API.

## Suppression du matricule

Depuis backend : `node migrate.js --remove-matricule`. Cette migration supprime
la colonne personnel.matricule et son index. Les identifiants du personnel et
les badges existants sont conservés. L’âge est calculé depuis date_naissance.
