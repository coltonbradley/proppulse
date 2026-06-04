import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchGames, fetchPlayerProps, type OddsApiGame } from '@/lib/odds-api'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SPORT_MAP = {
  basketball_nba: 'nba',
  americanfootball_nfl: 'nfl',
} as const

type OddsApiSport = keyof typeof SPORT_MAP

type Outcome = { name: string; price: number; point?: number }

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
        { onConflict: 'game_id,question_type,question_text' }
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
        { onConflict: 'game_id,question_type,question_text' }
      )
      if (!error) count++
    }
  }
  return count
}

async function seedPlayerProps(
  supabase: ReturnType<typeof getServiceClient>,
  apiSport: OddsApiSport,
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
      if (outcomes.length < 2) continue

      const over = outcomes.find((o) => o.name === 'Over') ?? outcomes[0]
      const under = outcomes.find((o) => o.name === 'Under') ?? outcomes[1]
      const label = market.key.replace('player_', '').replace(/_/g, ' ')
      const questionText = `${label} — over or under ${over.point}?`

      const { error } = await supabase.from('questions').upsert(
        {
          game_id: gameRowId,
          sport,
          question_type: 'player_prop',
          question_text: questionText,
          options: [
            { label: `Over ${over.point}` },
            { label: `Under ${under.point ?? over.point}` },
          ],
          closes_at: game.commence_time,
          status: 'open',
        },
        { onConflict: 'game_id,question_type,question_text' }
      )
      if (!error) count++
    }
  } catch {
    // Player props endpoint may 404 on free tier or for games without markets
  }
  return count
}

export async function POST() {
  const supabase = getServiceClient()
  const results = { games: 0, questions: 0 }

  for (const apiSport of Object.keys(SPORT_MAP) as OddsApiSport[]) {
    const sport = SPORT_MAP[apiSport]
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

      results.questions += await seedGameLines(supabase, game, gameRow.id, sport)
      results.questions += await seedPlayerProps(supabase, apiSport, game, gameRow.id, sport)
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
