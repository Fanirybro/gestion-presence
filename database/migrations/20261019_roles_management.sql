-- Migration: Roles & Permissions management
-- Allows the superadmin (COORDINATOR) to create custom roles and assign granular privileges to them.

BEGIN;

-- 1. Relax role check constraint on organisation_members to allow custom roles
ALTER TABLE organisation_members DROP CONSTRAINT IF EXISTS organisation_members_role_check;

-- 2. Create organisation_roles table
CREATE TABLE IF NOT EXISTS organisation_roles (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    code text NOT NULL,
    nom text NOT NULL,
    description text DEFAULT '',
    permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, code)
);

CREATE INDEX IF NOT EXISTS organisation_roles_org_idx ON organisation_roles (organisation_id);

-- 3. Populate default system roles for each organisation if not already present
INSERT INTO organisation_roles (organisation_id, code, nom, description, permissions, is_system)
SELECT 
    o.id, 
    'COORDINATOR', 
    'Coordinateur', 
    'Superadministrateur avec accès total et irrévocable à l''ensemble du système', 
    '{}'::jsonb, 
    true
FROM organisations o
ON CONFLICT (organisation_id, code) DO NOTHING;

INSERT INTO organisation_roles (organisation_id, code, nom, description, permissions, is_system)
SELECT 
    o.id, 
    'SECRETARY', 
    'Secrétaire', 
    'Rôle standard de pointage, consultation des présences et impression des rapports', 
    '{"scan": true, "kiosk": true, "leaves": true, "reports": true, "dashboard": true, "presences": true, "reports_print": true, "presences_add": false, "presences_justify": false}'::jsonb, 
    false
FROM organisations o
ON CONFLICT (organisation_id, code) DO NOTHING;

UPDATE organisation_roles SET is_system = false WHERE code != 'COORDINATOR';

COMMIT;

