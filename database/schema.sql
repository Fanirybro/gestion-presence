-- PostgreSQL 14+ : executer une seule fois dans une base vide existante.
-- psql -v ON_ERROR_STOP=1 -d presence_saas -f database/schema.sql
-- Aucun compte, mot de passe ou abonnement fictif n'est cree.
-- Les FK composites garantissent la coherence des organisations, pas les
-- autorisations de lecture : l'API doit filtrer par organisation et verifier le role.
BEGIN;

CREATE TABLE organisations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nom text NOT NULL CHECK (btrim(nom) <> ''),
    organisation_code integer UNIQUE,
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    adresse text,
    fuseau_horaire text NOT NULL DEFAULT 'Indian/Antananarivo',
    actif boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nom text NOT NULL CHECK (btrim(nom) <> ''),
    prenom text NOT NULL CHECK (btrim(prenom) <> ''),
    email text NOT NULL CHECK (email = btrim(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
    password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
    actif boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- Connexion par email seul, comme dans le frontend actuel.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE organisation_members (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status varchar NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED')),
    role text NOT NULL CHECK (role IN ('COORDINATOR', 'SECRETARY')),
    UNIQUE (organisation_id, user_id)
);
CREATE INDEX organisation_members_user_idx ON organisation_members (user_id);

CREATE TABLE departements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    nom text NOT NULL CHECK (nom = btrim(nom) AND nom <> ''),
    actif boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, id)
);
CREATE UNIQUE INDEX departements_nom_unique ON departements (organisation_id, lower(nom));

CREATE TABLE personnel (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    departement_id bigint NOT NULL,
    utilisateur_id bigint,
    nom text NOT NULL CHECK (btrim(nom) <> ''),
    prenom text NOT NULL CHECK (btrim(prenom) <> ''),
    date_naissance date NOT NULL CHECK (isfinite(date_naissance)),
    poste text,
    date_embauche date CHECK (isfinite(date_embauche)),
    actif boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, id),
    UNIQUE (organisation_id, utilisateur_id),
    FOREIGN KEY (organisation_id, departement_id) REFERENCES departements(organisation_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organisation_id, utilisateur_id) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT,
    CHECK (date_embauche IS NULL OR date_embauche >= date_naissance)
);
CREATE INDEX personnel_departement_idx ON personnel (organisation_id, departement_id);

CREATE TABLE badges (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    personnel_id bigint NOT NULL,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_by bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    revoked_by bigint,
    UNIQUE (organisation_id, personnel_id, id),
    FOREIGN KEY (organisation_id, personnel_id) REFERENCES personnel(organisation_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organisation_id, created_by) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (organisation_id, revoked_by) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT,
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE UNIQUE INDEX badges_un_actif ON badges (organisation_id, personnel_id) WHERE revoked_at IS NULL;

CREATE TABLE pointages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    personnel_id bigint NOT NULL,
    badge_id bigint,
    type text NOT NULL CHECK (type IN ('ARRIVAL', 'DEPARTURE')),
    horodatage timestamptz NOT NULL DEFAULT now() CHECK (isfinite(horodatage)),
    source text NOT NULL CHECK (source IN ('QR_SCAN', 'MANUAL')),
    saisi_par bigint NOT NULL,
    remarque text NOT NULL DEFAULT '' CHECK (char_length(remarque) <= 500),
    cle_idempotence uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, cle_idempotence),
    FOREIGN KEY (organisation_id, personnel_id) REFERENCES personnel(organisation_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organisation_id, personnel_id, badge_id) REFERENCES badges(organisation_id, personnel_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organisation_id, saisi_par) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT,
    CHECK ((source = 'QR_SCAN' AND badge_id IS NOT NULL) OR (source = 'MANUAL' AND badge_id IS NULL)),
    CHECK (source <> 'MANUAL' OR char_length(btrim(remarque)) >= 5)
);
CREATE INDEX pointages_personnel_date_idx ON pointages (organisation_id, personnel_id, horodatage DESC);
CREATE INDEX pointages_date_idx ON pointages (organisation_id, horodatage DESC);

CREATE TABLE absences_autorisees (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    personnel_id bigint NOT NULL,
    type text NOT NULL CHECK (type IN ('LEAVE', 'PERMISSION')),
    date_debut date NOT NULL CHECK (isfinite(date_debut)),
    date_fin date NOT NULL CHECK (isfinite(date_fin)),
    heure_debut time,
    heure_fin time,
    remarque text NOT NULL DEFAULT '' CHECK (char_length(remarque) <= 500),
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    annule_at timestamptz,
    annule_par bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organisation_id, personnel_id) REFERENCES personnel(organisation_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organisation_id, created_by) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (organisation_id, updated_by) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (organisation_id, annule_par) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT,
    CHECK (date_fin >= date_debut),
    CHECK (
        (type = 'LEAVE' AND heure_debut IS NULL AND heure_fin IS NULL)
        OR (type = 'PERMISSION' AND date_debut = date_fin
            AND heure_debut IS NOT NULL AND heure_fin IS NOT NULL
            AND heure_fin > heure_debut AND heure_fin < TIME '24:00')
    ),
    CHECK ((annule_at IS NULL) = (annule_par IS NULL)),
    CHECK (annule_at IS NULL OR annule_at >= created_at)
);
CREATE INDEX absences_personnel_periode_idx ON absences_autorisees (organisation_id, personnel_id, date_debut, date_fin);
CREATE INDEX absences_type_periode_idx ON absences_autorisees (organisation_id, type, date_debut);
COMMENT ON TABLE absences_autorisees IS 'Recensement des absences deja autorisees, sans demande ni approbation. Dates de conge inclusives, permissions dans une seule journee locale.';

CREATE TABLE horaires_travail (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    jour_semaine smallint NOT NULL CHECK (jour_semaine BETWEEN 0 AND 6),
    periode text NOT NULL DEFAULT 'MATIN' CHECK (periode IN ('MATIN', 'APRES_MIDI', 'SOIR')),
    fin_jour_suivant boolean NOT NULL DEFAULT false,
    jour_travaille boolean NOT NULL DEFAULT true,
    heure_debut time,
    heure_fin time,
    heure_limite_absence time,
    tolerance_retard_minutes smallint NOT NULL DEFAULT 0 CHECK (tolerance_retard_minutes >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, jour_semaine, periode),
    CONSTRAINT horaires_travail_creneau_check CHECK (
    (NOT jour_travaille AND heure_debut IS NULL AND heure_fin IS NULL
        AND heure_limite_absence IS NULL AND NOT fin_jour_suivant)
    OR (jour_travaille AND heure_debut IS NOT NULL AND heure_fin IS NOT NULL
        AND heure_limite_absence IS NOT NULL AND heure_debut < TIME '24:00'
        AND heure_fin < TIME '24:00' AND heure_limite_absence < TIME '24:00'
        AND ((NOT fin_jour_suivant AND heure_fin > heure_debut)
            OR (fin_jour_suivant AND periode = 'SOIR' AND heure_fin < heure_debut))
        AND extract(epoch FROM heure_limite_absence)
            + CASE WHEN fin_jour_suivant AND heure_limite_absence < heure_debut THEN 86400 ELSE 0 END
            BETWEEN extract(epoch FROM heure_debut)
            AND extract(epoch FROM heure_fin) + CASE WHEN fin_jour_suivant THEN 86400 ELSE 0 END
        AND tolerance_retard_minutes * 60 <= extract(epoch FROM heure_fin)
            + CASE WHEN fin_jour_suivant THEN 86400 ELSE 0 END - extract(epoch FROM heure_debut))
)
);
COMMENT ON COLUMN horaires_travail.jour_semaine IS '0 = dimanche, 1 = lundi, ... 6 = samedi (convention du frontend). Le soir peut se terminer le lendemain.';

CREATE TABLE presences_journalieres (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    personnel_id bigint NOT NULL,
    date_presence date NOT NULL CHECK (isfinite(date_presence)),
    arrivee_at timestamptz,
    depart_at timestamptz,
    statut text NOT NULL CHECK (statut IN ('PRESENT', 'LATE', 'ABSENT', 'JUSTIFIED')),
    retard_minutes integer NOT NULL DEFAULT 0 CHECK (retard_minutes >= 0),
    source text NOT NULL CHECK (source IN ('QR_SCAN', 'MANUAL', 'AUTOMATIC')),
    remarque text NOT NULL DEFAULT '' CHECK (char_length(remarque) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, personnel_id, date_presence),
    FOREIGN KEY (organisation_id, personnel_id) REFERENCES personnel(organisation_id, id) ON DELETE RESTRICT,
    CHECK (depart_at IS NULL OR (arrivee_at IS NOT NULL AND depart_at > arrivee_at)),
    CHECK (arrivee_at IS NULL OR isfinite(arrivee_at)),
    CHECK (depart_at IS NULL OR isfinite(depart_at)),
    CHECK (
        (statut = 'LATE' AND arrivee_at IS NOT NULL AND retard_minutes > 0)
        OR (statut = 'PRESENT' AND arrivee_at IS NOT NULL AND retard_minutes = 0)
        OR (statut IN ('ABSENT', 'JUSTIFIED') AND arrivee_at IS NULL AND depart_at IS NULL AND retard_minutes = 0)
    )
);
CREATE INDEX presences_date_statut_idx ON presences_journalieres (organisation_id, date_presence, statut);
COMMENT ON TABLE presences_journalieres IS 'Synthese alimentee par le futur service de presence. Ce script ne cree aucun calcul automatique ni lien automatique avec les conges.';

CREATE TABLE journal_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    acteur_id bigint,
    entite text NOT NULL CHECK (btrim(entite) <> ''),
    entite_id bigint NOT NULL,
    action text NOT NULL CHECK (btrim(action) <> ''),
    motif text,
    avant jsonb,
    apres jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organisation_id, acteur_id) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX audit_entite_idx ON journal_audit (organisation_id, entite, entite_id, created_at DESC);
COMMENT ON COLUMN journal_audit.entite_id IS 'Reference polymorphe : verifiee par le service appelant, pas par une FK SQL.';

CREATE TABLE archives_rapports (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    date_debut date NOT NULL CHECK (isfinite(date_debut)),
    date_fin date NOT NULL CHECK (isfinite(date_fin)),
    created_by bigint NOT NULL,
    snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    fichier_cle text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organisation_id, created_by) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT,
    CHECK (date_fin >= date_debut)
);
CREATE INDEX archives_periode_idx ON archives_rapports (organisation_id, date_debut, date_fin);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['organisations', 'users', 'departements', 'personnel', 'absences_autorisees', 'horaires_travail', 'presences_journalieres']
    LOOP
        EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name);
    END LOOP;
END;
$$;

CREATE FUNCTION validate_organisation_timezone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.fuseau_horaire) THEN
        RAISE EXCEPTION 'Fuseau horaire inconnu : %', NEW.fuseau_horaire USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_timezone BEFORE INSERT OR UPDATE OF fuseau_horaire ON organisations
FOR EACH ROW EXECUTE FUNCTION validate_organisation_timezone();

CREATE FUNCTION validate_birth_date() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE local_today date;
BEGIN
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire)::date INTO local_today
      FROM organisations WHERE id = NEW.organisation_id;
    IF NEW.date_naissance > local_today THEN
        RAISE EXCEPTION 'La date de naissance ne peut pas etre dans le futur.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_birth_date BEFORE INSERT OR UPDATE OF date_naissance, organisation_id ON personnel
FOR EACH ROW EXECUTE FUNCTION validate_birth_date();

COMMIT;
