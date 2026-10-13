-- À appliquer uniquement au nouveau schéma fourni avec organisation_members.
-- Aucun ancien rôle ni code n'est supprimé ou converti.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS organisation_members_pair_unique
    ON organisation_members (organisation_id, user_id);
CREATE INDEX IF NOT EXISTS organisation_members_user_idx ON organisation_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS organisations_integer_code_unique ON organisations (organisation_code);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
COMMIT;
