-- Migration: Add professional_pix_allowed setting toggle to establishments
BEGIN;

ALTER TABLE public.establishments 
  ADD COLUMN IF NOT EXISTS professional_pix_allowed boolean DEFAULT true NOT NULL;

COMMIT;
