-- Add stat column to questions for player prop stat categories (e.g. 'points', 'rebounds')
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS stat text;
