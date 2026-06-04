-- Mock player props seeded for development/testing
-- To delete all mock props: DELETE FROM public.questions WHERE question_text LIKE '[MOCK]%';

DO $$
DECLARE
  g RECORD;
  props text[][] := ARRAY[
    ARRAY['LeBron James points', '24.5'],
    ARRAY['LeBron James rebounds', '7.5'],
    ARRAY['LeBron James assists', '7.5'],
    ARRAY['Anthony Davis points', '26.5'],
    ARRAY['Anthony Davis rebounds', '11.5'],
    ARRAY['Stephen Curry points', '27.5'],
    ARRAY['Stephen Curry 3-pointers made', '4.5'],
    ARRAY['Stephen Curry assists', '5.5'],
    ARRAY['Nikola Jokic points', '27.5'],
    ARRAY['Nikola Jokic rebounds', '12.5'],
    ARRAY['Nikola Jokic assists', '9.5'],
    ARRAY['Jayson Tatum points', '26.5'],
    ARRAY['Jayson Tatum rebounds', '8.5'],
    ARRAY['Luka Doncic points', '29.5'],
    ARRAY['Luka Doncic assists', '8.5'],
    ARRAY['Luka Doncic rebounds', '8.5'],
    ARRAY['Giannis Antetokounmpo points', '30.5'],
    ARRAY['Giannis Antetokounmpo rebounds', '11.5'],
    ARRAY['Joel Embiid points', '32.5'],
    ARRAY['Joel Embiid rebounds', '10.5'],
    ARRAY['Kevin Durant points', '28.5'],
    ARRAY['Devin Booker points', '26.5'],
    ARRAY['Ja Morant points', '24.5'],
    ARRAY['Ja Morant assists', '7.5'],
    ARRAY['Tyrese Haliburton points', '21.5'],
    ARRAY['Tyrese Haliburton assists', '10.5'],
    ARRAY['Donovan Mitchell points', '26.5'],
    ARRAY['Shai Gilgeous-Alexander points', '30.5'],
    ARRAY['Cade Cunningham points', '24.5'],
    ARRAY['Victor Wembanyama points', '22.5'],
    ARRAY['Victor Wembanyama blocks', '3.5'],
    ARRAY['Victor Wembanyama rebounds', '10.5']
  ];
  i int;
  prop_name text;
  prop_line text;
  label text;
BEGIN
  FOR g IN
    SELECT id, home_team, away_team, starts_at
    FROM public.games
    WHERE sport = 'nba'
    AND starts_at > now()
    ORDER BY starts_at ASC
    LIMIT 4
  LOOP
    FOR i IN 1..array_length(props, 1) LOOP
      prop_name := props[i][1];
      prop_line := props[i][2];

      -- Derive a clean label (e.g. "points" -> "Points", "3-pointers made" -> "3-Pointers Made")
      label := prop_line;

      INSERT INTO public.questions (
        game_id, sport, question_type, question_text, options, closes_at, status
      ) VALUES (
        g.id,
        'nba',
        'player_prop',
        '[MOCK] ' || prop_name || ' — over or under ' || prop_line || '?',
        jsonb_build_array(
          jsonb_build_object('label', 'Over ' || prop_line),
          jsonb_build_object('label', 'Under ' || prop_line)
        ),
        g.starts_at,
        'open'
      )
      ON CONFLICT ON CONSTRAINT questions_game_type_text_unique DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
