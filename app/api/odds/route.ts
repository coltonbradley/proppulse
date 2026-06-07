import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchGames, fetchPlayerProps, type OddsApiGame, type OddsApiSportKey } from '@/lib/odds-api'
import { SPORT_BY_KEY } from '@/lib/sports.config'
import { ALL_ODDS_API_KEYS, ODDS_API_TO_SPORT } from '@/lib/sports.config'
import { fetchPrizePicksLines, type PPLine } from '@/lib/prizepicks'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// The Odds API sometimes returns abbreviated national team names; normalize to full names.
const TEAM_NAME_MAP: Record<string, string> = {
  'Africa': 'South Africa',
  'S. Africa': 'South Africa',
  'N. Ireland': 'Northern Ireland',
  'Trinidad': 'Trinidad and Tobago',
}
function normalizeTeam(name: string): string {
  return TEAM_NAME_MAP[name] ?? name
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
  sport: string,
  ppLines: Map<string, import('@/lib/prizepicks').PPLine>
) {
  let count = 0

  // All sports: seed props directly from PrizePicks cache.
  // Filter to lines for this specific game by matching the player's team name
  // against the game's home/away team (both use full official team names).
  const gameLines = Array.from(ppLines.values()).filter(l => {
    if (l.sport !== sport) return false
    // If team info is available, match by team — prevents Wembanyama appearing in a Cubs game.
    // If team info is missing (old cache), fall back to sport-only match.
    if (l.playerTeamFull) {
      return l.playerTeamFull === game.home_team || l.playerTeamFull === game.away_team
    }
    return sport !== 'soccer'
  })

  if (!gameLines.length) return count

  // Delete any existing player props for this game that have no picks yet.
  const { data: existingProps } = await supabase
    .from('questions')
    .select('id')
    .eq('game_id', gameRowId)
    .eq('question_type', 'player_prop')
  const existingIds = (existingProps ?? []).map((q: { id: string }) => q.id)
  if (existingIds.length) {
    const { data: pickedIds } = await supabase
      .from('picks')
      .select('question_id')
      .in('question_id', existingIds)
    const pickedSet = new Set((pickedIds ?? []).map((p: { question_id: string }) => p.question_id))
    const safeToDelete = existingIds.filter((id: string) => !pickedSet.has(id))
    if (safeToDelete.length) {
      await supabase.from('questions').delete().in('id', safeToDelete)
    }
  }

  for (const ppLine of gameLines) {
    const questionText = `${ppLine.playerName} ${ppLine.statLabel} — over or under ${ppLine.line}?`
    const { error } = await supabase.from('questions').upsert(
      {
        game_id: gameRowId,
        sport,
        question_type: 'player_prop',
        stat: ppLine.statLabel,
        question_text: questionText,
        options: [{ label: `Over ${ppLine.line}` }, { label: `Under ${ppLine.line}` }],
        closes_at: game.commence_time,
        status: 'open',
      },
      { onConflict: 'game_id,question_type,question_text', ignoreDuplicates: true }
    )
    if (!error) count++
  }

  return count
}

async function seedSoccerProps(
  supabase: ReturnType<typeof getServiceClient>,
  apiSport: OddsApiSportKey,
  game: OddsApiGame,
  gameRowId: string,
  ppLines: Map<string, import('@/lib/prizepicks').PPLine>
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

      const byPlayer = new Map<string, { over: Outcome | null; under: Outcome | null }>()
      for (const outcome of outcomes) {
        const player = outcome.description ?? 'Unknown'
        if (!byPlayer.has(player)) byPlayer.set(player, { over: null, under: null })
        const entry = byPlayer.get(player)!
        if (outcome.name === 'Over') entry.over = outcome
        if (outcome.name === 'Under') entry.under = outcome
      }

      for (const [player, { over, under }] of byPlayer) {
        if (!over || over.point == null || over.point <= 0) continue
        if (!player || player.startsWith('{') || /^total$/i.test(player.trim())) continue

        const ppKey = `${player.toLowerCase()}:${statLabel}`
        const ppEntry = ppLines.get(ppKey)
        const finalLine = ppEntry ? ppEntry.line : over.point

        const hasUnder = !!under
        const questionText = hasUnder
          ? `${player} ${statLabel} — over or under ${finalLine}?`
          : `${player} ${finalLine}+ ${statLabel}?`
        const options = hasUnder
          ? [{ label: `Over ${finalLine}` }, { label: `Under ${finalLine}` }]
          : [{ label: 'Yes' }, { label: 'No' }]

        const { error } = await supabase.from('questions').upsert(
          {
            game_id: gameRowId,
            sport: 'soccer',
            question_type: 'player_prop',
            stat: statLabel,
            question_text: questionText,
            options,
            closes_at: game.commence_time,
            status: 'open',
          },
          { onConflict: 'game_id,question_type,question_text', ignoreDuplicates: true }
        )
        if (!error) count++
      }
    }
  } catch {
    // Soccer props endpoint may 404 for games without markets
  }
  return count
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  const bearer = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const validCron = secret === cronSecret || bearer === `Bearer ${cronSecret}`
  const validBearer = bearer === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  if (!validCron && !validBearer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const sportFilter = searchParams.get('sport')

  const supabase = getServiceClient()
  const results = { games: 0, questions: 0 }
  const apiErrors: Record<string, string> = {}

  // Load PrizePicks cache — source of truth for all US sport props and game discovery
  const ppLines = await fetchPrizePicksLines()

  // ── US sports: discover games + seed props from PrizePicks cache ──────────
  // Group PP lines by pp_game_id to find unique upcoming games.
  // Both teams' players appear under the same pp_game_id, so we can recover
  // both team names without any abbreviation lookup table.
  const usSports = ['nba', 'nfl', 'mlb', 'nhl', 'soccer']
  const sportsToProcess = sportFilter
    ? [ODDS_API_TO_SPORT[sportFilter]].filter(Boolean)
    : usSports

  const ppGameMap = new Map<string, { sport: string; startsAt: string; teams: Set<string> }>()
  for (const line of ppLines.values()) {
    if (!usSports.includes(line.sport)) continue
    if (!line.ppGameId || !line.gameStartsAt || !line.playerTeamFull) continue
    if (sportFilter && ODDS_API_TO_SPORT[sportFilter] !== line.sport) continue

    if (!ppGameMap.has(line.ppGameId)) {
      ppGameMap.set(line.ppGameId, { sport: line.sport, startsAt: line.gameStartsAt, teams: new Set() })
    }
    ppGameMap.get(line.ppGameId)!.teams.add(line.playerTeamFull)
  }

  // ── World Cup Tournament props (WORLD CUP TRNY in PrizePicks) ────────────────
  // sport = 'soccer_tournament' in PP cache. Group by player's national team,
  // create one virtual game per country: away=Country, home='the World'.
  const internalSportFilter = sportFilter ? (ODDS_API_TO_SPORT[sportFilter] ?? sportFilter) : null
  const processTournament = !internalSportFilter || internalSportFilter === 'soccer' || internalSportFilter === 'soccer_tournament'
  const tournamentErrors: string[] = []
  if (processTournament) {
    const tourneyLines = Array.from(ppLines.values()).filter(l => l.sport === 'soccer_tournament' && l.playerTeamFull)
    const byTeam = new Map<string, typeof tourneyLines[number][]>()
    for (const line of tourneyLines) {
      const team = line.playerTeamFull!
      if (!byTeam.has(team)) byTeam.set(team, [])
      byTeam.get(team)!.push(line)
    }

    // Tournament props close after the World Cup final (July 19 2026).
    // All team stats accumulate through the tournament, so we can't resolve early.
    const tournamentEnds = '2026-07-20T00:00:00Z'

    for (const [team, teamLines] of byTeam) {
      const startsAt = teamLines.find(l => l.gameStartsAt)?.gameStartsAt
        ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const extId = `wc-trny:${team.toLowerCase().replace(/\s+/g, '-')}`

      const { data: existingTGame } = await supabase
        .from('games').select('id').eq('sport', 'soccer_tournament').eq('away_team', team).single()

      let tGameRowId: string
      if (existingTGame) {
        tGameRowId = (existingTGame as { id: string }).id
      } else {
        const { data: tGameRow, error: tGameErr } = await supabase
          .from('games')
          .upsert(
            { external_id: extId, sport: 'soccer_tournament', home_team: 'the World', away_team: team, starts_at: startsAt, status: 'scheduled' },
            { onConflict: 'external_id' }
          )
          .select('id').single()
        if (tGameErr || !tGameRow) {
          tournamentErrors.push(`game upsert ${team}: ${tGameErr?.message ?? 'no row returned'}`)
          continue
        }
        tGameRowId = (tGameRow as { id: string }).id
        results.games++
      }

      const { data: existTProps } = await supabase.from('questions').select('id').eq('game_id', tGameRowId).eq('question_type', 'player_prop')
      const existTIds = (existTProps ?? []).map((q: { id: string }) => q.id)
      if (existTIds.length) {
        const { data: pickedT } = await supabase.from('picks').select('question_id').in('question_id', existTIds)
        const pickedTSet = new Set((pickedT ?? []).map((p: { question_id: string }) => p.question_id))
        const safeT = existTIds.filter((id: string) => !pickedTSet.has(id))
        if (safeT.length) await supabase.from('questions').delete().in('id', safeT)
      }

      for (const ppLine of teamLines) {
        const questionText = `${ppLine.playerName} ${ppLine.statLabel} — over or under ${ppLine.line}?`
        const { error } = await supabase.from('questions').upsert(
          { game_id: tGameRowId, sport: 'soccer_tournament', question_type: 'player_prop', stat: ppLine.statLabel, question_text: questionText, options: [{ label: `Over ${ppLine.line}` }, { label: `Under ${ppLine.line}` }], closes_at: tournamentEnds, status: 'open' },
          { onConflict: 'game_id,question_type,question_text', ignoreDuplicates: true }
        )
        if (!error) results.questions++
      }
    }
  }

  for (const [ppGameId, { sport, startsAt, teams }] of ppGameMap) {
    if (!sportsToProcess.includes(sport)) continue
    const teamList = Array.from(teams)
    if (teamList.length < 2) continue  // need both teams to create a valid game record

    const [homeTeam, awayTeam] = teamList
    const gameDate = startsAt.slice(0, 10)

    // Dedup: reuse an existing game row for the same match if already in DB.
    // Use fuzzy last-word matching so "Golden Knights" matches "Vegas Golden Knights".
    const lastWord = (s: string) => s.toLowerCase().trim().split(' ').pop() ?? ''
    const fuzzyMatch = (a: string, b: string) =>
      a.toLowerCase().trim() === b.toLowerCase().trim() ||
      (lastWord(a).length > 2 && lastWord(a) === lastWord(b))

    const { data: candidateGames } = await supabase
      .from('games')
      .select('id, home_team, away_team')
      .eq('sport', sport)
      .gte('starts_at', `${gameDate}T00:00:00Z`)
      .lt('starts_at', `${gameDate}T23:59:59Z`)

    const existingByTeams = (candidateGames ?? []).find(
      (g: { id: string; home_team: string; away_team: string }) =>
        fuzzyMatch(g.home_team, homeTeam) && fuzzyMatch(g.away_team, awayTeam)
    )

    let gameRowId: string
    if (existingByTeams) {
      gameRowId = existingByTeams.id
    } else {
      const { data: gameRow, error: gameErr } = await supabase
        .from('games')
        .upsert(
          { external_id: ppGameId, sport, home_team: homeTeam, away_team: awayTeam, starts_at: startsAt, status: 'scheduled' },
          { onConflict: 'external_id' }
        )
        .select('id')
        .single()
      if (gameErr || !gameRow) continue
      gameRowId = gameRow.id
      results.games++
    }

    results.questions += await seedPlayerProps(supabase, sport as OddsApiSportKey, { id: ppGameId, home_team: homeTeam, away_team: awayTeam, commence_time: startsAt, sport_key: sport, bookmakers: [] }, gameRowId, sport, ppLines)
  }

  // ── Soccer: still uses The Odds API for game discovery + props ────────────
  const soccerKeys = ALL_ODDS_API_KEYS.filter(k => ODDS_API_TO_SPORT[k] === 'soccer')
  const processSoccer = !internalSportFilter || internalSportFilter === 'soccer'

  if (processSoccer) {
    for (const apiSport of soccerKeys) {
      let games
      try {
        games = await fetchGames(apiSport)
      } catch (err) {
        apiErrors[apiSport] = err instanceof Error ? err.message : String(err)
        continue
      }

      for (const rawGame of games) {
        const game = { ...rawGame, home_team: normalizeTeam(rawGame.home_team), away_team: normalizeTeam(rawGame.away_team) }
        const gameDate = game.commence_time.slice(0, 10)
        const dateGte = `${gameDate}T00:00:00Z`
        const dateLt  = `${gameDate}T23:59:59Z`

        // Check for existing game with correct home/away ordering
        const { data: existingCorrect } = await supabase
          .from('games').select('id')
          .eq('sport', 'soccer').eq('home_team', game.home_team).eq('away_team', game.away_team)
          .gte('starts_at', dateGte).lt('starts_at', dateLt).neq('external_id', game.id).single()

        if (existingCorrect) continue

        // Check for existing game with teams swapped (PP inserted them in wrong order) — fix in place
        const { data: existingSwapped } = await supabase
          .from('games').select('id')
          .eq('sport', 'soccer').eq('home_team', game.away_team).eq('away_team', game.home_team)
          .gte('starts_at', dateGte).lt('starts_at', dateLt).neq('external_id', game.id).single()

        if (existingSwapped) {
          await supabase.from('games')
            .update({ home_team: game.home_team, away_team: game.away_team })
            .eq('id', (existingSwapped as { id: string }).id)
          continue
        }

        const { data: gameRow, error: gameErr } = await supabase
          .from('games')
          .upsert(
            { external_id: game.id, sport: 'soccer', home_team: game.home_team, away_team: game.away_team, starts_at: game.commence_time, status: 'scheduled' },
            { onConflict: 'external_id' }
          )
          .select('id')
          .single()

        if (gameErr || !gameRow) continue
        results.games++
        results.questions += await seedGameLines(supabase, game, gameRow.id, 'soccer')
        results.questions += await seedSoccerProps(supabase, apiSport, game, gameRow.id, ppLines)
      }
    }
  }

  return NextResponse.json({ ok: true, ...results, ppLines: ppLines.size, ...(tournamentErrors.length ? { tournamentErrors } : {}), ...(Object.keys(apiErrors).length ? { apiErrors } : {}) })
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
  return NextResponse.json({ all: allCounts, upcoming: upcomingCounts })
}
