-- Migration: Add custom_fields_schema to organisations
-- Allows organisations to define dynamic custom fields for personnel metadata

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS custom_fields_schema jsonb NOT NULL DEFAULT '[]'::jsonb;

