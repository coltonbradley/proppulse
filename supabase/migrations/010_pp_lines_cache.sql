-- Cache for PrizePicks standard-tier lines, populated by browser-side admin sync.
-- Keyed by player_name + sport + stat_label so upsert replaces stale lines.
CREATE TABLE IF NOT EXISTS pp_lines_cache (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name text NOT NULL,
  sport       text NOT NULL,
  stat_label  text NOT NULL,
  line        numeric NOT NULL,
  synced_at   timestamptz DEFAULT now() NOT NULL,
  UNIQUE (player_name, sport, stat_label)
);

ALTER TABLE pp_lines_cache ENABLE ROW LEVEL SECURITY;

-- Service role can read/write; no anon access needed.
CREATE POLICY "service_role_all" ON pp_lines_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
