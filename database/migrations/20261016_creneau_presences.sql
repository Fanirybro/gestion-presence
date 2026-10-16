-- Migration : Gestion des présences et absences par créneau (MATIN, APRES_MIDI, SOIR)
BEGIN;

-- 1. Ajouter la colonne periode si elle n'existe pas encore
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'presences_journalieres' AND column_name = 'periode'
    ) THEN
        ALTER TABLE presences_journalieres 
        ADD COLUMN periode text NOT NULL DEFAULT 'MATIN' 
        CHECK (periode IN ('MATIN', 'APRES_MIDI', 'SOIR'));
    END IF;
END $$;

-- 2. Supprimer l'ancienne contrainte d'unicité par jour
ALTER TABLE presences_journalieres 
DROP CONSTRAINT IF EXISTS presences_journalieres_organisation_id_personnel_id_date_pr_key;

-- 3. Ajouter la nouvelle contrainte d'unicité (organisation_id, personnel_id, date_presence, periode)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'presences_journalieres_org_personnel_date_periode_key'
    ) THEN
        ALTER TABLE presences_journalieres 
        ADD CONSTRAINT presences_journalieres_org_personnel_date_periode_key 
        UNIQUE (organisation_id, personnel_id, date_presence, periode);
    END IF;
END $$;

-- 4. Mettre à jour l'index
CREATE INDEX IF NOT EXISTS presences_date_periode_statut_idx 
ON presences_journalieres (organisation_id, date_presence, periode, statut);

COMMIT;

