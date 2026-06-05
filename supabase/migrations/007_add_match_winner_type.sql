-- Add match_winner to the questions.question_type CHECK constraint
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('player_prop', 'game_line', 'over_under', 'match_winner'));
