-- Add game + team metadata to pp_lines_cache so the seeder can match
-- player props to the correct game when multiple games are on the same day.
ALTER TABLE pp_lines_cache
  ADD COLUMN IF NOT EXISTS pp_game_id       text,
  ADD COLUMN IF NOT EXISTS game_starts_at   timestamptz,
  ADD COLUMN IF NOT EXISTS player_team_full text;
