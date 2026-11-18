-- Migration: Support du type 'MISSION' dans les absences autorisées
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'absences_autorisees'::regclass
          AND contype = 'c'
          AND (pg_get_constraintdef(oid) LIKE '%type%' OR conname LIKE '%type%')
    ) LOOP
        EXECUTE 'ALTER TABLE absences_autorisees DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE absences_autorisees
  ADD CONSTRAINT absences_autorisees_type_check
  CHECK (type IN ('LEAVE', 'PERMISSION', 'MISSION'));

ALTER TABLE absences_autorisees
  ADD CONSTRAINT absences_autorisees_details_check
  CHECK (
    (type IN ('LEAVE', 'MISSION') AND heure_debut IS NULL AND heure_fin IS NULL)
    OR (type = 'PERMISSION' AND date_debut = date_fin
        AND heure_debut IS NOT NULL AND heure_fin IS NOT NULL
        AND heure_fin > heure_debut AND heure_fin < TIME '24:00')
  );
