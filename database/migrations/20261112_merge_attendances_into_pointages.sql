-- Migration: Unification des flux de présence dans la table pointages
-- Suppression de la table redondante 'attendances'

BEGIN;

-- 1. Ajout de la colonne confidence pour les scores de reconnaissance faciale
ALTER TABLE public.pointages 
ADD COLUMN IF NOT EXISTS confidence double precision;

-- 2. Rendre saisi_par nullable (les pointages automatiques ou FaceID n'ont pas d'opérateur humain direct)
ALTER TABLE public.pointages 
ALTER COLUMN saisi_par DROP NOT NULL;

-- 3. Mise à jour de la contrainte source
ALTER TABLE public.pointages DROP CONSTRAINT IF EXISTS pointages_source_check;
ALTER TABLE public.pointages ADD CONSTRAINT pointages_source_check 
  CHECK (source = ANY (ARRAY['QR_SCAN'::text, 'FACE_RECOGNITION'::text, 'MANUAL'::text, 'AUTOMATIC'::text]));

-- 4. Mise à jour de la contrainte type
ALTER TABLE public.pointages DROP CONSTRAINT IF EXISTS pointages_type_check;
ALTER TABLE public.pointages ADD CONSTRAINT pointages_type_check 
  CHECK (type = ANY (ARRAY['ARRIVAL'::text, 'DEPARTURE'::text, 'CHECK_IN'::text, 'CHECK_OUT'::text]));

-- 5. Mise à jour de la contrainte badge_id
ALTER TABLE public.pointages DROP CONSTRAINT IF EXISTS pointages_check;
ALTER TABLE public.pointages ADD CONSTRAINT pointages_check 
  CHECK (
    (source = 'QR_SCAN'::text AND badge_id IS NOT NULL) OR 
    (source = ANY (ARRAY['MANUAL'::text, 'FACE_RECOGNITION'::text, 'AUTOMATIC'::text]) AND badge_id IS NULL)
  );

-- 6. Mise à jour de la contrainte source sur presences_journalieres
ALTER TABLE public.presences_journalieres DROP CONSTRAINT IF EXISTS presences_journalieres_source_check;
ALTER TABLE public.presences_journalieres ADD CONSTRAINT presences_journalieres_source_check 
  CHECK (source = ANY (ARRAY['QR_SCAN'::text, 'FACE_RECOGNITION'::text, 'MANUAL'::text, 'AUTOMATIC'::text]));

-- 7. Suppression définitive de la table attendances
DROP TABLE IF EXISTS public.attendances CASCADE;

COMMIT;
