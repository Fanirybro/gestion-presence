-- Migration: Ensure default organisation roles (COORDINATOR and SECRETARY) exist for all organisations
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

