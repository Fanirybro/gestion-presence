-- Restaure l'isolation des pointages sans supprimer de données.
-- Si une ancienne ligne est orpheline ou incohérente, toute la migration échoue.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE pointages ADD COLUMN IF NOT EXISTS organisation_id bigint;
UPDATE pointages t SET organisation_id = p.organisation_id
FROM personnel p WHERE p.id = t.personnel_id AND t.organisation_id IS NULL;
ALTER TABLE pointages ALTER COLUMN organisation_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pointages_org_idempotence_unique ON pointages (organisation_id, cle_idempotence);
CREATE INDEX IF NOT EXISTS pointages_personnel_date_idx ON pointages (organisation_id, personnel_id, horodatage DESC);
CREATE INDEX IF NOT EXISTS pointages_date_idx ON pointages (organisation_id, horodatage DESC);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pointages'::regclass AND conname = 'pointages_qr_org_fkey') THEN
    ALTER TABLE pointages ADD CONSTRAINT pointages_qr_org_fkey FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pointages'::regclass AND conname = 'pointages_qr_personnel_fkey') THEN
    ALTER TABLE pointages ADD CONSTRAINT pointages_qr_personnel_fkey FOREIGN KEY (organisation_id, personnel_id) REFERENCES personnel(organisation_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pointages'::regclass AND conname = 'pointages_qr_badge_fkey') THEN
    ALTER TABLE pointages ADD CONSTRAINT pointages_qr_badge_fkey FOREIGN KEY (organisation_id, personnel_id, badge_id) REFERENCES badges(organisation_id, personnel_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pointages'::regclass AND conname = 'pointages_qr_actor_fkey') THEN
    ALTER TABLE pointages ADD CONSTRAINT pointages_qr_actor_fkey FOREIGN KEY (organisation_id, saisi_par) REFERENCES organisation_members(organisation_id, user_id) ON DELETE RESTRICT;
  END IF;
END;
$$;
COMMIT;
