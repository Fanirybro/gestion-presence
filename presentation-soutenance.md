# 📊 Présentation de Soutenance
## Conception et Développement d'un Système de Gestion des Fiches des Personnels et des Présences

> **Public cible :** Personnel de l'entreprise (non-technique, avec valorisation de la stack)  
> **Durée estimée :** 15–20 minutes de présentation + 5–10 minutes de questions

---

# SLIDE 1 — Introduction et Contexte du Projet

## Titre : Système de Gestion des Fiches du Personnel et des Présences

### Points clés :

- **Cadre :** Stage de Licence 3 — Projet de conception et développement d'une application web professionnelle

- **Besoin identifié :** L'entreprise gère les fiches du personnel et le suivi des présences via des processus manuels — papier, tableurs, ou pointeuses physiques peu fiables

- **Ambition du projet :** Proposer un système moderne, centralisé et intelligent, capable de digitaliser intégralement la gestion RH des présences

- **Deux modes de pointage complémentaires :**
  - 🔲 Scan de **QR Code** (badge numérique personnel)
  - 🧠 **Reconnaissance faciale par Intelligence Artificielle** (borne biométrique)

- **Périmètre fonctionnel :** Gestion multi-organisations, départements, horaires, congés/permissions, rapports, et traçabilité complète (journal d'audit)

### 🖼️ Illustration à insérer :
> Capture de la page d'accueil / Dashboard de l'application (vue Coordinateur ou Secrétaire) montrant le tableau de bord avec les indicateurs clés de présence du jour.

---

# SLIDE 2 — Problématique et Objectifs

## Titre : Problématique & Objectifs du Projet

### ❓ Problématique :

- Comment concevoir un système fiable, sécurisé et évolutif permettant de :
  - Centraliser les fiches du personnel et leurs informations administratives ?
  - Automatiser le suivi des présences en temps réel, via des technologies modernes (QR Code et biométrie faciale) ?
  - Garantir la traçabilité et l'intégrité des données pour les besoins RH ?

### 🎯 Objectifs fonctionnels :

- **OBJ 1 ·** Créer et gérer les fiches complètes du personnel (nom, prénom, poste, département, date d'embauche)
- **OBJ 2 ·** Générer un badge QR unique et sécurisé par agent, servant de support de pointage
- **OBJ 3 ·** Mettre en place un pointage biométrique par reconnaissance faciale en temps réel — arrivées et départs
- **OBJ 4 ·** Consolider automatiquement les présences journalières avec détection des retards et absences
- **OBJ 5 ·** Offrir une gestion des congés, permissions, horaires de travail et génération de rapports

### 🎯 Objectifs techniques :

- Architecture en micro-services pour isoler le module d'IA
- Sécurisation des données biométriques (embeddings stockés, jamais les photos)
- Application responsive, déployable et multi-organisations (SaaS-ready)

### 🖼️ Illustration à insérer :
> Schéma simple : à gauche l'état "AVANT" (icône papier / tableur / pointeuse manuelle) → flèche → à droite l'état "APRÈS" (icône application web avec QR + caméra). Ou un slide sobre avec les objectifs numérotés en puces visuelles.

---

# SLIDE 3 — Architecture Globale et Technologies

## Titre : Architecture Technique & Stack Technologique

### 🏗️ Architecture 3-tiers + Micro-service IA :

| Couche | Technologie | Rôle |
|---|---|---|
| **Frontend** | React + TypeScript + Vite + TailwindCSS | Interface utilisateur interactive et responsive |
| **Backend (API)** | Node.js + Express.js | Logique métier, API REST, authentification par sessions |
| **Base de données** | PostgreSQL | Stockage structuré : personnel, pointages, horaires, embeddings faciaux (JSONB) |
| **Micro-service IA** | Python + FastAPI + OpenCV DNN | Service isolé de reconnaissance faciale, conteneurisable via Docker |

### 🔗 Flux de communication :

- Le **Frontend React** communique avec le **Backend Express** via des appels API REST (Axios)
- Le **Backend Express** orchestre la logique et délègue au **Micro-service Python** pour les opérations de vision par ordinateur (enrôlement et vérification faciale)
- Le **Micro-service Python** charge les modèles ONNX (YuNet + SFace) au démarrage et expose deux endpoints : `/enroll` et `/verify`
- Les **embeddings faciaux** (vecteurs de 128 dimensions) sont stockés en JSONB dans PostgreSQL — jamais les images

### 🔐 Points de sécurité :

- Aucune photo de visage n'est conservée sur le serveur — seuls les vecteurs numériques (embeddings) sont persistés
- Les tokens de badge QR sont hashés en SHA-256 en base de données
- Chaque pointage est horodaté et tracé dans un journal d'audit

### 🖼️ Illustration à insérer :
> Schéma d'architecture en blocs :  
> **[Navigateur / React]** ↔ **[API Node.js / Express]** ↔ **[PostgreSQL]**  
> + **[API Node.js]** → **[Micro-service Python / FastAPI]**  
> Flèches annotées avec les protocoles (HTTP/REST, JSON). Ajouter les logos des technologies sur chaque bloc.

---

# SLIDE 4 — Gestion des Fiches du Personnel & QR Code

## Titre : Fonctionnalité 1 · Gestion du Personnel & Pointage par QR Code

### 👤 Gestion des fiches du personnel :

- Création, modification et consultation des fiches agent : nom, prénom, date de naissance, poste, département, date d'embauche
- Organisation multi-départements avec rattachement hiérarchique
- Deux rôles utilisateurs : **Coordinateur** (administration complète) et **Secrétaire** (gestion opérationnelle)
- Gestion des congés (LEAVE) et permissions (PERMISSION) avec contrôles de cohérence intégrés

### 🔲 Système de badge QR Code :

- Chaque agent se voit attribuer un **badge numérique unique** contenant un token QR sécurisé
- Le token est **hashé en SHA-256** avant stockage — impossible de reconstituer le token à partir de la base
- Un seul badge actif par agent à tout instant (index unique avec révocation)
- Impression du badge au format PDF (via jsPDF) pour distribution physique

### 📱 Pointage par scan QR :

- Interface de scan dédiée utilisant la caméra du terminal (via html5-qrcode)
- Le scan déclenche automatiquement l'enregistrement : **Arrivée** ou **Départ** selon la logique horaire
- Feedback visuel immédiat : confirmation animée (succès ✓ / erreur ✗) avec cooldown de 5 secondes
- Mode **saisie manuelle de secours** si la caméra n'est pas disponible
- Mode **secrétaire simplifié** avec affichage plein écran pour un usage borne/kiosque

### 🖼️ Illustrations à insérer (2 captures) :
> 1. Capture de l'interface de gestion des fiches du personnel (liste des agents avec département et poste).
> 2. Capture de la page de scan QR Code en action — avec le cadre caméra, le feedback "Pointage confirmé", et l'historique des derniers scans à droite.

---

# SLIDE 5 — Pointage Biométrique par Reconnaissance Faciale

## Titre : Fonctionnalité 2 · Pointage Biométrique par Reconnaissance Faciale (IA)

### 🧠 Le pipeline d'Intelligence Artificielle :

Le système repose sur deux modèles de deep learning complémentaires, exécutés dans un micro-service Python isolé :

| Étape | Modèle | Rôle |
|---|---|---|
| **1. Détection** | **YuNet** (ONNX) | Localise le visage dans l'image en temps réel — repère les 5 points de référence faciaux (yeux, nez, bouche) |
| **2. Reconnaissance** | **SFace** (ONNX) | Extrait un vecteur biométrique de **128 dimensions** (embedding) à partir du visage aligné |
| **3. Comparaison** | Similarité cosinique | Compare l'embedding capturé en direct avec les profils enregistrés — seuil de confiance à **0.55** |

### 📝 Processus d'enrôlement (inscription biométrique) :

- Le coordinateur sélectionne un agent dans la liste du personnel
- La caméra détecte automatiquement le visage avec un **réticule de guidage circulaire**
- Un **compte à rebours de 3 secondes** se déclenche quand le visage est correctement centré
- La capture est envoyée au micro-service Python → extraction de l'embedding → stockage en base (JSONB)
- **Temporisation de 10 secondes** post-enrôlement pour éviter les captures en boucle, puis passage automatique à l'agent suivant

### 📷 Processus de pointage (borne kiosque) :

- L'agent se présente devant la borne — détection automatique du visage par face-api.js côté navigateur
- Compte à rebours 3s → capture → envoi au micro-service Python via le backend
- Vérification contre tous les profils enregistrés de l'organisation
- Résultat affiché directement dans le cadre caméra : nom de l'agent, type de pointage (Arrivée / Départ), score de confiance
- Bip sonore différencié : succès (920 Hz) vs échec (280 Hz) — feedback audio immédiat
- Historique des derniers pointages en temps réel dans le panneau latéral

### 🖼️ Illustrations à insérer (2 à 3 captures) :
> 1. Capture de la page d'enrôlement biométrique : caméra active avec le réticule circulaire, le compte à rebours "3", la liste du personnel à droite avec les statuts "Enrôlé / Non enrôlé".
> 2. Capture de la borne de pointage facial : feedback "Pointage Validé !" avec le nom de l'agent, le type "🟢 Arrivée" et le score de confiance affiché.
> 3. (Optionnel) Schéma simplifié du pipeline IA : Image → YuNet (Détection) → SFace (Embedding 128D) → Comparaison cosinique → Match / No Match.

---

# SLIDE 6 — Démonstration et Bénéfices pour l'Entreprise

## Titre : Bénéfices Concrets & Valeur pour l'Entreprise

### ✅ Bénéfices opérationnels :

- **Gain de temps :** Pointage en moins de 3 secondes par agent (QR ou facial) vs saisie manuelle
- **Fiabilité renforcée :** Élimination des oublis de pointage et des erreurs de saisie humaine
- **Traçabilité totale :** Chaque action est enregistrée dans un journal d'audit (qui a fait quoi, quand, avec quel motif)
- **Double méthode de pointage :** QR Code pour la simplicité + Reconnaissance faciale pour la sécurité — choix flexible selon le contexte
- **Détection automatique des retards et absences :** Calcul en temps réel basé sur les horaires configurés par l'organisation

### 📊 Fonctionnalités complémentaires à valeur ajoutée :

- **Rapports archivés :** Génération et archivage de rapports de présence sur des périodes personnalisées (snapshots JSONB)
- **Gestion des congés et permissions :** Suivi intégré avec distinction congés (multi-jours) vs permissions (intra-journée)
- **Multi-organisations :** Architecture nativement conçue pour supporter plusieurs structures indépendantes (SaaS-ready)
- **Horaires flexibles :** Créneaux matin / après-midi / soir configurables par jour, avec tolérance de retard ajustable

### 🔒 Garanties de sécurité et confidentialité :

- Aucune image de visage stockée — seuls les vecteurs numériques sont conservés
- Tokens QR hashés — aucun risque en cas de compromission de la base
- Service IA isolé et conteneurisable — surface d'attaque minimale

### 🖼️ Illustrations à insérer :
> 1. Capture de l'interface de consultation des présences journalières (tableau avec statuts PRESENT / LATE / ABSENT / JUSTIFIED).
> 2. Capture de la page de rapports ou du dashboard avec les statistiques de présence.
> 3. (Optionnel) Capture de la gestion des horaires de travail ou de la page des congés/permissions.

---

# SLIDE 7 — Conclusion et Perspectives

## Titre : Conclusion & Perspectives d'Évolution

### 📋 Bilan du projet :

- ✅ Application web fonctionnelle couvrant la **gestion complète du personnel** et le **suivi des présences**
- ✅ **Deux méthodes de pointage opérationnelles** : QR Code et reconnaissance faciale par IA
- ✅ Architecture **modulaire en micro-services** — chaque brique est indépendante et maintenable
- ✅ Base de données **rigoureusement contrainte** (13 tables, FK composites, triggers de validation, journal d'audit)
- ✅ Couverture de tests automatisés (Playwright E2E + tests unitaires backend)
- ✅ Code source structuré : ~11 contrôleurs backend, ~18 pages frontend, 1 micro-service IA Python

### 🔮 Perspectives d'évolution :

- **Notifications push :** Alertes en temps réel pour les absences non justifiées et les retards récurrents
- **Application mobile :** Portage en Progressive Web App (PWA) ou application native pour le pointage en mobilité
- **Anti-spoofing avancé :** Détection de liveness (anti-fraude photo/vidéo) pour durcir la sécurité biométrique
- **Tableaux de bord analytiques :** Statistiques avancées avec visualisations graphiques (taux de ponctualité, tendances, etc.)
- **Export réglementaire :** Génération de documents conformes au droit du travail local
- **Intégration SIRH :** Connexion avec les systèmes de paie et de gestion RH existants

### 🙏 Remerciements :

- Encadrants académiques et tuteur en entreprise
- Équipe de l'entreprise d'accueil pour sa disponibilité et ses retours

### 🖼️ Illustration à insérer :
> Slide sobre avec un récapitulatif visuel : icônes des technologies utilisées (React, Node.js, PostgreSQL, Python, FastAPI, OpenCV, Docker) alignées en bas de slide. En haut, les points forts du projet sous forme d'icônes check (✅). Section "Perspectives" avec des flèches vers le futur.

---

# 📝 Notes pour la mise en forme

### Conseils de design :
- Privilégiez un **fond sombre** (bleu marine / gris ardoise) cohérent avec l'UI de l'application
- Limitez-vous à **5-6 puces maximum par slide** — découpez si besoin
- Les captures d'écran doivent être **encadrées** (mockup navigateur ou arrondi avec ombre)
- Ajoutez les **logos des technologies** sur la slide 3 (React, Node.js, PostgreSQL, Python, FastAPI, OpenCV, Docker)
- La slide 5 (IA) est la plus technique — accompagnez-la d'un schéma pipeline visuel
- La slide 6 est la plus impactante pour le public non-technique — insistez sur les chiffres et bénéfices

### Démonstration :
- Prévoyez une **démonstration en direct** (ou vidéo de secours) à intégrer dans la slide 6 : scan QR + pointage facial

