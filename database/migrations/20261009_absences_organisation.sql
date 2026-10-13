BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE absences_autorisees ADD COLUMN IF NOT EXISTS organisation_id bigint;
UPDATE absences_autorisees a SET organisation_id=p.organisation_id FROM personnel p WHERE p.id=a.personnel_id AND a.organisation_id IS NULL;
ALTER TABLE absences_autorisees ALTER COLUMN organisation_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='absences_org_personnel_fkey' AND conrelid='absences_autorisees'::regclass) THEN
    ALTER TABLE absences_autorisees ADD CONSTRAINT absences_org_personnel_fkey FOREIGN KEY (organisation_id,personnel_id) REFERENCES personnel(organisation_id,id);
    ALTER TABLE absences_autorisees ADD CONSTRAINT absences_org_creator_fkey FOREIGN KEY (organisation_id,created_by) REFERENCES organisation_members(organisation_id,user_id);
    ALTER TABLE absences_autorisees ADD CONSTRAINT absences_org_editor_fkey FOREIGN KEY (organisation_id,updated_by) REFERENCES organisation_members(organisation_id,user_id);
    ALTER TABLE absences_autorisees ADD CONSTRAINT absences_org_cancel_fkey FOREIGN KEY (organisation_id,annule_par) REFERENCES organisation_members(organisation_id,user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS absences_org_personnel_periode_idx ON absences_autorisees(organisation_id,personnel_id,date_debut,date_fin);
COMMIT;
