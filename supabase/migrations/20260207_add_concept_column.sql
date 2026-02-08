-- Migration: Add concept column to questions table
ALTER TABLE questions ADD COLUMN IF NOT EXISTS concept TEXT;
