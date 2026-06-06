-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Analytics Infrastructure
-- ─────────────────────────────────────────────────────────────────────────────

-- TABLE: consensus_results
-- Denormalized record of every resolved question with crowd outcome data.
-- Populated by the resolver job; survives question/pick cleanup cascades.
CREATE TABLE IF NOT EXISTS public.consensus_results (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id           uuid REFERENCES public.questions(id),
  winning_option_index  int,
  total_votes           int,
  crowd_was_correct     boolean,
  consensus_bracket     text,
  sport                 text,
  prop_type             text,
  majority_pct          int,
  resolved_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consensus_results_bracket_idx ON public.consensus_results(consensus_bracket);
CREATE INDEX IF NOT EXISTS consensus_results_sport_idx   ON public.consensus_results(sport);
CREATE INDEX IF NOT EXISTS consensus_results_resolved_at ON public.consensus_results(resolved_at DESC);

ALTER TABLE public.consensus_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consensus results are viewable by everyone"
  ON public.consensus_results FOR SELECT USING (true);

CREATE POLICY "Service role can manage consensus results"
  ON public.consensus_results FOR ALL USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- Add analytics columns to user_stats
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS fade_accuracy       int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follow_accuracy     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_sport          text,
  ADD COLUMN IF NOT EXISTS best_prop_type      text,
  ADD COLUMN IF NOT EXISTS contrarian_score    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_fade_picks    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_follow_picks  int NOT NULL DEFAULT 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: get_consensus_accuracy()
-- Returns crowd accuracy broken down by bracket × sport.
-- The caller aggregates for bracket-only or sport-only views.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_consensus_accuracy()
RETURNS TABLE(
  bracket          text,
  sport            text,
  total_questions  bigint,
  correct          bigint,
  accuracy_pct     numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    consensus_bracket                                                          AS bracket,
    sport,
    COUNT(*)                                                                   AS total_questions,
    COUNT(*) FILTER (WHERE crowd_was_correct = true)                          AS correct,
    CASE WHEN COUNT(*) = 0 THEN 0
         ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE crowd_was_correct = true)
                    / COUNT(*))
    END                                                                        AS accuracy_pct
  FROM public.consensus_results
  GROUP BY consensus_bracket, sport
  ORDER BY
    CASE consensus_bracket
      WHEN '50-59%' THEN 1
      WHEN '60-69%' THEN 2
      WHEN '70-79%' THEN 3
      WHEN '80%+'   THEN 4
      ELSE 5
    END,
    sport;
$$;

GRANT EXECUTE ON FUNCTION public.get_consensus_accuracy() TO authenticated, anon, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: get_herd_accuracy(p_min_pct)
-- Returns aggregate accuracy for questions where majority_pct >= p_min_pct.
-- Used by the public-facing accuracy chip (threshold: 70%).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_herd_accuracy(p_min_pct int DEFAULT 70)
RETURNS TABLE(total bigint, correct bigint, accuracy_pct numeric)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)                                                            AS total,
    COUNT(*) FILTER (WHERE crowd_was_correct = true)                   AS correct,
    CASE WHEN COUNT(*) = 0 THEN 0
         ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE crowd_was_correct = true)
                    / COUNT(*))
    END                                                                 AS accuracy_pct
  FROM public.consensus_results
  WHERE majority_pct >= p_min_pct;
$$;

GRANT EXECUTE ON FUNCTION public.get_herd_accuracy(int) TO authenticated, anon, service_role;
