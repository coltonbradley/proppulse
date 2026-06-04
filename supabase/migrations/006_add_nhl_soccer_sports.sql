-- Add NHL and Soccer to the games.sport CHECK constraint
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_sport_check;
ALTER TABLE public.games ADD CONSTRAINT games_sport_check
  CHECK (sport IN ('nba', 'nfl', 'mlb', 'nhl', 'soccer'));
