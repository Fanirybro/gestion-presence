-- Migration: Add pointage mode options to organisations
-- Allows organisations to configure allowed check-in modes: QR code only, Facial Recognition only, or Both.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS pointage_qr boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pointage_facial boolean NOT NULL DEFAULT true;

-- Ensure that at least one pointage method is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_at_least_one_pointage_mode'
  ) THEN
    ALTER TABLE organisations
      ADD CONSTRAINT check_at_least_one_pointage_mode
      CHECK (pointage_qr = true OR pointage_facial = true);
  END IF;
END $$;

