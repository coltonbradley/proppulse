-- Add soccer_tournament to games.sport and questions.sport CHECK constraints
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_sport_check;
ALTER TABLE public.games ADD CONSTRAINT games_sport_check
  CHECK (sport IN ('nba', 'nfl', 'mlb', 'nhl', 'soccer', 'soccer_tournament'));

-- Also extend questions sport constraint if one exists
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_sport_check;
