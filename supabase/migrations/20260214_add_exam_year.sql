-- Migration: Add exam_year to exam_materials
-- Date: 2026-02-14

ALTER TABLE public.exam_materials ADD COLUMN IF NOT EXISTS exam_year integer NOT NULL DEFAULT 2024;

-- Reload schema cache to reflect changes immediately
NOTIFY pgrst, 'reload schema';
