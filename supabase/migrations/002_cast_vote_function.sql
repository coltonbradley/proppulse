-- PropPulse: cast_vote() RPC function
-- Flow A from the brief: atomic insert + consensus update
-- Run this AFTER 001_initial_schema.sql

CREATE OR REPLACE FUNCTION public.cast_vote(
  p_question_id  uuid,
  p_option_index int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_question       public.questions%ROWTYPE;
  v_total_votes    int;
  v_option_count   int;
  v_community_pct  int;
  v_pick_id        uuid;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch the question and lock it
  SELECT * INTO v_question
    FROM public.questions
   WHERE id = p_question_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  IF v_question.status != 'open' THEN
    RAISE EXCEPTION 'Voting is closed for this question';
  END IF;

  IF v_question.closes_at < now() THEN
    RAISE EXCEPTION 'Voting deadline has passed';
  END IF;

  -- Validate option index
  v_option_count := jsonb_array_length(v_question.options);
  IF p_option_index < 0 OR p_option_index >= v_option_count THEN
    RAISE EXCEPTION 'Invalid option index';
  END IF;

  -- Get current pct for the chosen option (snapshot before this vote)
  SELECT COALESCE(pct, 0) INTO v_community_pct
    FROM public.consensus
   WHERE question_id = p_question_id
     AND option_index = p_option_index;

  -- Insert the pick (UNIQUE constraint enforces one pick per user per question)
  INSERT INTO public.picks (user_id, question_id, option_index, community_pct_at_vote)
  VALUES (v_user_id, p_question_id, p_option_index, v_community_pct)
  RETURNING id INTO v_pick_id;

  -- Upsert vote count for chosen option
  INSERT INTO public.consensus (question_id, option_index, vote_count, pct, updated_at)
  VALUES (p_question_id, p_option_index, 1, 0, now())
  ON CONFLICT (question_id, option_index)
  DO UPDATE SET
    vote_count = consensus.vote_count + 1,
    updated_at = now();

  -- Recalculate pct for ALL options on this question atomically
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

  -- Return updated consensus for this question
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'option_index', option_index,
        'vote_count', vote_count,
        'pct', pct
      ) ORDER BY option_index
    )
    FROM public.consensus
    WHERE question_id = p_question_id
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.cast_vote(uuid, int) TO authenticated;
