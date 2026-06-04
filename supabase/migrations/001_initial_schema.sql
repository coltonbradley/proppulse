-- PropPulse: Initial Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- ─────────────────────────────────────────────
-- TABLE: profiles (extends Supabase auth.users)
-- ─────────────────────────────────────────────
CREATE TABLE public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  username     text UNIQUE NOT NULL,
  avatar_url   text,
  is_premium   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────
-- TABLE: games
-- ─────────────────────────────────────────────
CREATE TABLE public.games (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id  text UNIQUE NOT NULL,
  sport        text NOT NULL CHECK (sport IN ('nba', 'nfl', 'mlb')),
  home_team    text NOT NULL,
  away_team    text NOT NULL,
  starts_at    timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Games are viewable by everyone"
  ON public.games FOR SELECT USING (true);

CREATE POLICY "Service role can manage games"
  ON public.games FOR ALL USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────
-- TABLE: questions
-- ─────────────────────────────────────────────
CREATE TABLE public.questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  sport           text NOT NULL,
  question_type   text NOT NULL CHECK (question_type IN ('player_prop', 'game_line', 'over_under')),
  question_text   text NOT NULL,
  options         jsonb NOT NULL,
  closes_at       timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
  correct_option  int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX questions_status_idx ON public.questions(status);
CREATE INDEX questions_sport_idx ON public.questions(sport);
CREATE INDEX questions_closes_at_idx ON public.questions(closes_at);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Questions are viewable by everyone"
  ON public.questions FOR SELECT USING (true);

CREATE POLICY "Service role can manage questions"
  ON public.questions FOR ALL USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────
-- TABLE: picks
-- ─────────────────────────────────────────────
CREATE TABLE public.picks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id           uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_index          int NOT NULL,
  community_pct_at_vote int,
  picked_at             timestamptz NOT NULL DEFAULT now(),
  result                text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'win', 'loss')),
  UNIQUE (user_id, question_id)
);

CREATE INDEX picks_user_id_idx ON public.picks(user_id);
CREATE INDEX picks_question_id_idx ON public.picks(question_id);

ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own picks"
  ON public.picks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert picks via RPC"
  ON public.picks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update picks"
  ON public.picks FOR UPDATE USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────
-- TABLE: consensus
-- ─────────────────────────────────────────────
CREATE TABLE public.consensus (
  question_id   uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_index  int NOT NULL,
  vote_count    int NOT NULL DEFAULT 0,
  pct           int NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, option_index)
);

ALTER TABLE public.consensus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consensus is viewable by everyone"
  ON public.consensus FOR SELECT USING (true);

CREATE POLICY "Service role can manage consensus"
  ON public.consensus FOR ALL USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────
-- TABLE: user_stats
-- ─────────────────────────────────────────────
CREATE TABLE public.user_stats (
  user_id           uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_picks       int NOT NULL DEFAULT 0,
  correct_picks     int NOT NULL DEFAULT 0,
  accuracy_pct      int NOT NULL DEFAULT 0,
  vs_community_pct  int NOT NULL DEFAULT 0,
  current_streak    int NOT NULL DEFAULT 0,
  longest_streak    int NOT NULL DEFAULT 0,
  sport_breakdown   jsonb NOT NULL DEFAULT '{}',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User stats are viewable by everyone"
  ON public.user_stats FOR SELECT USING (true);

CREATE POLICY "Service role can manage user stats"
  ON public.user_stats FOR ALL USING (auth.role() = 'service_role');

-- Auto-create user_stats row when profile is created
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();
