-- Add 'push' to picks.result so exact-line player prop hits can be voided.
ALTER TABLE public.picks DROP CONSTRAINT picks_result_check;
ALTER TABLE public.picks ADD CONSTRAINT picks_result_check
  CHECK (result IN ('pending', 'win', 'loss', 'push'));
