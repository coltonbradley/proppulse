-- Prevents duplicate questions when the seeder runs multiple times
ALTER TABLE public.questions
  ADD CONSTRAINT questions_game_type_text_unique
  UNIQUE (game_id, question_type, question_text);
