-- Conserve chaque ancien horaire sous MATIN, sans modifier ses heures.
-- Les deux nouveaux créneaux sont initialement désactivés.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE horaires_travail ADD COLUMN IF NOT EXISTS periode text NOT NULL DEFAULT 'MATIN'
    CHECK (periode IN ('MATIN', 'APRES_MIDI', 'SOIR'));
ALTER TABLE horaires_travail ADD COLUMN IF NOT EXISTS fin_jour_suivant boolean NOT NULL DEFAULT false;

DO $$
DECLARE item record;
BEGIN
    FOR item IN
        SELECT c.conname FROM pg_constraint c
        WHERE c.conrelid = 'horaires_travail'::regclass AND c.contype = 'u'
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM unnest(c.conkey) AS k(attnum)
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
             = ARRAY['jour_semaine', 'organisation_id']::text[]
    LOOP
        EXECUTE format('ALTER TABLE horaires_travail DROP CONSTRAINT %I', item.conname);
    END LOOP;
    FOR item IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'horaires_travail'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%heure_fin%'
    LOOP
        EXECUTE format('ALTER TABLE horaires_travail DROP CONSTRAINT %I', item.conname);
    END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS horaires_travail_org_jour_periode_unique
    ON horaires_travail (organisation_id, jour_semaine, periode);

ALTER TABLE horaires_travail ADD CONSTRAINT horaires_travail_creneau_check CHECK (
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
);

INSERT INTO horaires_travail (organisation_id, jour_semaine, periode, jour_travaille)
SELECT existing.organisation_id, existing.jour_semaine, periods.periode, false
FROM (SELECT DISTINCT organisation_id, jour_semaine FROM horaires_travail) existing
CROSS JOIN (VALUES ('MATIN'), ('APRES_MIDI'), ('SOIR')) AS periods(periode)
ON CONFLICT (organisation_id, jour_semaine, periode) DO NOTHING;
COMMENT ON COLUMN horaires_travail.fin_jour_suivant IS 'Soir uniquement. Le jour de rattachement est celui du debut du creneau.';
COMMIT;
