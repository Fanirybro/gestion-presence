-- Compatible avec une colonne organisation_code déjà ajoutée manuellement.
BEGIN;
ALTER TABLE users ALTER COLUMN organisation_id DROP NOT NULL;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS organisation_code text;
UPDATE organisations SET organisation_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
WHERE organisation_code IS NULL OR btrim(organisation_code) = '';
ALTER TABLE organisations ALTER COLUMN organisation_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
ALTER TABLE organisations ALTER COLUMN organisation_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organisations_code_unique ON organisations (upper(organisation_code));
COMMIT;
