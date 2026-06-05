import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchGames, fetchPlayerProps, type OddsApiGame, type OddsApiSportKey } from '@/lib/odds-api'
import { ALL_ODDS_API_KEYS, ODDS_API_TO_SPORT } from '@/lib/sports.config'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Outcome = { name: string; price: number; point?: number; description?: string }

async function seedGameLines(
  supabase: ReturnType<typeof getServiceClient>,
  game: OddsApiGame,
  gameRowId: string,
  sport: string
) {
  let count = 0
  const bookmaker = game.bookmakers?.[0]
  if (!bookmaker) return count

  for (const market of bookmaker.markets ?? []) {
    const outcomes: Outcome[] = market.outcomes
    if (outcomes.length < 2) continue

    // Match winner (h2h) — soccer only; free tier, 3-way (home/draw/away)
    if (market.key === 'h2h' && sport === 'soccer') {
      const questionText = `Who wins: ${game.away_team} @ ${game.home_team}?`
      const options = outcomes.map((o) => ({ label: o.name }))
      const { error } = await supabase.from('questions').upsert(
        {
          game_id: gameRowId,
          sport,
          question_type: 'match_winner',
          question_text: questionText,
          options,
          closes_at: game.commence_time,
          status: 'open',
        },
        { onConflict: 'game_id,question_type,question_text', ignoreDuplicates: true }
      )
      if (!error) count++
    }

    if (market.key === 'spreads') {
      const home = outcomes.find((o) => o.name === game.home_team) ?? outcomes[0]
      const away = outcomes.find((o) => o.name === game.away_team) ?? outcomes[1]
      const spread = home.point ?? 0
      const questionText = `${game.away_team} @ ${game.home_team} — spread: ${game.home_team} ${spread > 0 ? '+' : ''}${spread}?`

      const { error } = await supabase.from('questions').upsert(
        {
          game_id: gameRowId,
          sport,
          question_type: 'game_line',
          question_text: questionText,
          options: [
            { label: `${game.home_team} ${spread > 0 ? '+' : ''}${spread}` },
            { label: `${game.away_team} ${away.point && away.point > 0 ? '+' : ''}${away.point}` },
          ],
          closes_at: game.commence_time,
          status: 'open',
        },
        { onConflict: 'game_id,question_type,question_text', ignoreDuplicates: true }
      )
      if (!error) count++
    }

    if (market.key === 'totals') {
      const over = outcomes.find((o) => o.name === 'Over')
      const under = outcomes.find((o) => o.name === 'Under')
      if (!over || !under) continue
      const total = over.point ?? 0
      const questionText = `${game.away_team} @ ${game.home_team} — total over or under ${total}?`

      const { error } = await supabase.from('questions').upsert(
        {
          game_id: gameRowId,
          sport,
          question_type: 'over_under',
          question_text: questionText,
          options: [
            { label: `Over ${total}` },
            { label: `Under ${total}` },
          ],
          closes_at: game.commence_time,
          status: 'open',
        },
        { onConflict: 'game_id,question_type,question_text', ignoreDuplicates: true }
      )
      if (!error) count++
    }
  }
  return count
}

async function seedPlayerProps(
  supabase: ReturnType<typeof getServiceClient>,
  apiSport: OddsApiSportKey,
  game: OddsApiGame,
  gameRowId: string,
  sport: string
) {
  let count = 0
  try {
    const propsData = await fetchPlayerProps(apiSport, game.id)
    const bookmaker = propsData?.bookmakers?.[0]
    if (!bookmaker) return count

    for (const market of bookmaker.markets ?? []) {
      if (!market.key.startsWith('player_')) continue
      const outcomes: Outcome[] = market.outcomes
      const statLabel = market.key.replace('player_', '').replace(/_/g, ' ')

      // Group outcomes by player name (stored in the description field)
      const byPlayer = new Map<string, { over: Outcome | null; under: Outcome | null }>()
      for (const outcome of outcomes) {
        const player = outcome.description ?? 'Unknown'
        if (!byPlayer.has(player)) byPlayer.set(player, { over: null, under: null })
        const entry = byPlayer.get(player)!
        if (outcome.name === 'Over') entry.over = outcome
        if (outcome.name === 'Under') entry.under = outcome
      }

      for (const [player, { over, under }] of byPlayer) {
        if (!over || !under || over.point == null) continue
        const questionText = `${player} ${statLabel} — over or under ${over.point}?`

        const { error } = await supabase.from('questions').upsert(
          {
            game_id: gameRowId,
            sport,
            question_type: 'player_prop',
            stat: statLabel,
            question_text: questionText,
            options: [
              { label: `Over ${over.point}` },
              { label: `Under ${under.point ?? over.point}` },
            ],
            closes_at: game.commence_time,
            status: 'open',
          },
          { onConflict: 'game_id,question_type,question_text', ignoreDuplicates: true }
        )
        if (!error) count++
      }
    }
  } catch {
    // Player props endpoint may 404 on free tier or for games without markets
  }
  return count
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  const bearer = req.headers.get('authorization')
  const validCron = secret === process.env.CRON_SECRET
  const validBearer = bearer === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  if (!validCron && !validBearer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const sportFilter = searchParams.get('sport')
  const propsOnly = searchParams.get('props_only') === 'true'

  const supabase = getServiceClient()
  const results = { games: 0, questions: 0 }

  const apiKeys = sportFilter ? [sportFilter] : ALL_ODDS_API_KEYS

  for (const apiSport of apiKeys) {
    const sport = ODDS_API_TO_SPORT[apiSport]
    if (!sport) continue
    const games = await fetchGames(apiSport)

    for (const game of games) {
      const { data: gameRow, error: gameErr } = await supabase
        .from('games')
        .upsert(
          {
            external_id: game.id,
            sport,
            home_team: game.home_team,
            away_team: game.away_team,
            starts_at: game.commence_time,
            status: 'scheduled',
          },
          { onConflict: 'external_id' }
        )
        .select('id')
        .single()

      if (gameErr || !gameRow) continue
      results.games++

      if (!propsOnly) results.questions += await seedGameLines(supabase, game, gameRow.id, sport)
      results.questions += await seedPlayerProps(supabase, apiSport, game, gameRow.id, sport)
    }
  }

  return NextResponse.json({ ok: true, ...results })
}

export async function GET() {
  const supabase = getServiceClient()
  const now = new Date().toISOString()
  const { data: all } = await supabase.from('questions').select('sport, question_type, status')
  const { data: upcoming } = await supabase.from('questions').select('sport, question_type, status, closes_at').gt('closes_at', now)
  const { data: sample } = await supabase.from('questions').select('question_text, closes_at, status').eq('question_type', 'match_winner').limit(3)

  const allCounts: Record<string, number> = {}
  for (const row of all ?? []) {
    const key = `${row.sport}/${row.question_type}/${row.status}`
    allCounts[key] = (allCounts[key] ?? 0) + 1
  }
  const upcomingCounts: Record<string, number> = {}
  for (const row of upcoming ?? []) {
    const key = `${row.sport}/${row.question_type}/${row.status}`
    upcomingCounts[key] = (upcomingCounts[key] ?? 0) + 1
  }
  // Test exact feed query for soccer match_winner
  const { data: feedTest, error: feedErr } = await supabase
    .from('questions')
    .select('id, question_text, games!inner(home_team, away_team)')
    .eq('status', 'open')
    .gt('closes_at', now)
    .in('question_type', ['player_prop', 'match_winner'])
    .eq('sport', 'soccer')
    .limit(3)

  return NextResponse.json({ all: allCounts, upcoming: upcomingCounts, matchWinnerSample: sample, feedTest, feedErr })
}
