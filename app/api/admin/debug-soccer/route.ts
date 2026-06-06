import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check for duplicate NBA games (same teams, different IDs)
  const { data: nbaGames } = await supabase
    .from('games')
    .select('id, external_id, home_team, away_team, starts_at')
    .eq('sport', 'nba')
    .order('starts_at')

  // Check for zero/bad NBA props
  const { data: badProps } = await supabase
    .from('questions')
    .select('id, question_text, stat, options')
    .eq('sport', 'nba')
    .eq('question_type', 'player_prop')
    .eq('status', 'open')
    .or('stat.ilike.%alternate%,stat.ilike.%alt%,question_text.ilike.%over or under 0%')
    .limit(20)

  // Check stat distribution for NBA props
  const { data: statCounts } = await supabase
    .from('questions')
    .select('stat')
    .eq('sport', 'nba')
    .eq('question_type', 'player_prop')
    .eq('status', 'open')

  const statMap: Record<string, number> = {}
  for (const row of statCounts ?? []) {
    const s = row.stat ?? 'null'
    statMap[s] = (statMap[s] ?? 0) + 1
  }

  return NextResponse.json({ nba_games: nbaGames, bad_props: badProps, stat_counts: statMap })

  // Get a sample soccer game external_id from DB
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _supabase = supabase
  const { data: games } = await supabase
    .from('games')
    .select('external_id, home_team, away_team')
    .eq('sport', 'soccer')
    .limit(3)

  if (!games?.length) return NextResponse.json({ error: 'No soccer games in DB' })

  // Get a soccer game ID from DB (seeded via ParlayAPI)
  const { data: soccerGames } = await supabase
    .from('games')
    .select('external_id, home_team, away_team')
    .eq('sport', 'soccer')
    .limit(2)

  // Also fetch what The Odds API returns for soccer events to compare IDs
  const oddsApiEventsRes = await fetch(
    `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/events?apiKey=${process.env.ODDS_API_KEY}`,
    { cache: 'no-store' }
  )
  const oddsApiEvents = await oddsApiEventsRes.json()

  const results = []

  // Test props using actual Odds API event IDs (not DB IDs)
  const oddsApiEventList = Array.isArray(oddsApiEvents) ? oddsApiEvents as {id:string; home_team:string; away_team:string}[] : []
  // Just test the first game with full response
  const event = oddsApiEventList[0]
  if (event) {
    const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/events/${event.id}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=uk,eu,us&markets=player_shots_on_target`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    const bookmaker = data?.bookmakers?.[0]
    const market = bookmaker?.markets?.[0]
    results.push({
      game: `${event.away_team} @ ${event.home_team}`,
      odds_api_id: event.id,
      props_status: res.status,
      bookmaker: bookmaker?.key,
      outcome_names: market?.outcomes?.map((o: {name:string; description:string; point:number}) => `${o.name}|${o.description}|${o.point}`),
    })
  }

  return NextResponse.json({
    odds_api_events: oddsApiEventList.slice(0, 3).map(e => ({ id: e.id, match: `${e.away_team} @ ${e.home_team}` })),
    prop_tests: results,
  })

  return NextResponse.json(results)
}
