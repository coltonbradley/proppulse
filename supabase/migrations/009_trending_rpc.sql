-- Computes trending questions using:
--   trend_score = recent_vote_count × abs(dominant_pct − 50) / 100
-- SECURITY DEFINER so it can count across all picks regardless of RLS.
CREATE OR REPLACE FUNCTION public.get_trending_questions(p_limit int DEFAULT 5)
RETURNS TABLE (
  question_id uuid,
  recent_votes bigint,
  trend_score numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent_picks AS (
    SELECT question_id, COUNT(*) AS cnt
    FROM picks
    WHERE picked_at > NOW() - INTERVAL '60 minutes'
    GROUP BY question_id
  ),
  max_deviation AS (
    SELECT question_id, MAX(ABS(pct - 50.0)) AS deviation
    FROM consensus
    GROUP BY question_id
  )
  SELECT
    rp.question_id,
    rp.cnt                                       AS recent_votes,
    rp.cnt * COALESCE(md.deviation, 0) / 100.0  AS trend_score
  FROM recent_picks rp
  LEFT JOIN max_deviation md USING (question_id)
  ORDER BY trend_score DESC
  LIMIT p_limit;
$$;
