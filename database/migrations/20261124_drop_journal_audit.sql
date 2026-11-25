-- Suppression de la table journal_audit et de ses dépendances
BEGIN;

DROP TABLE IF EXISTS journal_audit CASCADE;

COMMIT;
