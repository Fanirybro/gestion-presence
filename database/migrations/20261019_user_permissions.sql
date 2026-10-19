-- Migration: Add granular permissions column to organisation_members
-- Allows the superadmin (COORDINATOR) to configure individual module and feature access per user

ALTER TABLE organisation_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

