-- Migration: Rename role codes COORDINATOR -> SUPERADMIN and SECRETARY -> ADMIN
BEGIN;

UPDATE organisation_roles
SET code = 'SUPERADMIN', nom = 'SuperAdmin'
WHERE code = 'COORDINATOR';

UPDATE organisation_roles
SET code = 'ADMIN'
WHERE code = 'SECRETARY';

UPDATE organisation_members
SET role = 'SUPERADMIN'
WHERE role = 'COORDINATOR';

UPDATE organisation_members
SET role = 'ADMIN'
WHERE role = 'SECRETARY';

COMMIT;
