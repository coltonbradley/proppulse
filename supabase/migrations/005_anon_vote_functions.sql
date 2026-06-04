-- cast_anon_vote: updates consensus only, no auth required
-- Called when a non-logged-in user casts a vote
CREATE OR REPLACE FUNCTION public.cast_anon_vote(
  p_question_id  uuid,
  p_option_index int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_question     public.questions%ROWTYPE;
  v_total_votes  int;
  v_option_count int;
BEGIN
  SELECT * INTO v_question
    FROM public.questions
   WHERE id = p_question_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  IF v_question.status != 'open' THEN
    RAISE EXCEPTION 'Voting is closed';
  END IF;

  IF v_question.closes_at < now() THEN
    RAISE EXCEPTION 'Voting deadline has passed';
  END IF;

  v_option_count := jsonb_array_length(v_question.options);
  IF p_option_index < 0 OR p_option_index >= v_option_count THEN
    RAISE EXCEPTION 'Invalid option index';
  END IF;

  INSERT INTO public.consensus (question_id, option_index, vote_count, pct, updated_at)
  VALUES (p_question_id, p_option_index, 1, 0, now())
  ON CONFLICT (question_id, option_index)
  DO UPDATE SET
    vote_count = consensus.vote_count + 1,
    updated_at = now();

  SELECT SUM(vote_count) INTO v_total_votes
    FROM public.consensus
   WHERE question_id = p_question_id;

  UPDATE public.consensus
     SET pct = CASE
           WHEN v_total_votes = 0 THEN 0
           ELSE ROUND((vote_count::numeric / v_total_votes) * 100)::int
         END,
         updated_at = now()
   WHERE question_id = p_question_id;

  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object('option_index', option_index, 'vote_count', vote_count, 'pct', pct)
      ORDER BY option_index
    )
    FROM public.consensus
    WHERE question_id = p_question_id
  );
END;
$$;

-- Allow unauthenticated users to call this function
GRANT EXECUTE ON FUNCTION public.cast_anon_vote(uuid, int) TO anon;


-- cast_vote_replay: inserts pick record only — consensus already counted by cast_anon_vote
-- Called when a user signs in after voting anonymously
CREATE OR REPLACE FUNCTION public.cast_vote_replay(
  p_question_id  uuid,
  p_option_index int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_community_pct int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(pct, 0) INTO v_community_pct
    FROM public.consensus
   WHERE question_id = p_question_id
     AND option_index = p_option_index;

  -- Insert pick but do NOT touch consensus (anon vote already counted it)
  INSERT INTO public.picks (user_id, question_id, option_index, community_pct_at_vote)
  VALUES (v_user_id, p_question_id, p_option_index, v_community_pct)
  ON CONFLICT (user_id, question_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_vote_replay(uuid, int) TO authenticated;
