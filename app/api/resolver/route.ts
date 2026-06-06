import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ALL_ODDS_API_KEYS } from '@/lib/sports.config'
import {
  fetchEspnGamesForDate,
  fetchEspnPlayerStats,
  resolvePlayerProp,
  extractPlayerName,
  extractStatFromQuestion,
  teamsMatch,
} from '@/lib/espn-stats'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type ScoreResult = {
  id: string
  completed: boolean
  home_team: string
  away_team: string
  scores: { name: string; score: string }[] | null
}

async function fetchScores(sport: string): Promise<ScoreResult[]> {
  // Game scores (spreads/totals/match_winner) sourced from The Odds API scores endpoint
  const key = process.env.ODDS_API_KEY
  if (!key) return []
  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sport}/scores?daysFrom=3&apiKey=${key}`
  )
  if (!res.ok) return []
  return res.json()
}

function resolveOverUnder(
  options: { label: string }[],
  homeScore: number,
  awayScore: number
): number | null {
  const line = parseFloat(options[0].label.replace('Over ', ''))
  if (isNaN(line)) return null
  const total = homeScore + awayScore
  if (total === line) return null // push — leave pending
  return total > line ? 0 : 1   // 0 = Over, 1 = Under
}

function resolveMatchWinner(
  options: { label: string }[],
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number
): number | null {
  const winnerName =
    homeScore > awayScore ? homeTeam :
    awayScore > homeScore ? awayTeam :
    'Draw'

  // Exact match first, then last-word fuzzy match for team name variations
  let idx = options.findIndex((o) => o.label === winnerName)
  if (idx === -1 && winnerName !== 'Draw') {
    const lastWord = winnerName.split(' ').pop() ?? ''
    idx = options.findIndex((o) => o.label.includes(lastWord))
  }
  return idx >= 0 ? idx : null
}

function resolveGameLine(
  options: { label: string }[],
  homeTeam: string,
  homeScore: number,
  awayScore: number
): number | null {
  // options[0] is home team label e.g. "Oklahoma City Thunder -7.5"
  // options[1] is away team label e.g. "San Antonio Spurs +7.5"
  const spreadMatch = options[0].label.match(/([+-]?\d+\.?\d*)$/)
  if (!spreadMatch) return null
  const spread = parseFloat(spreadMatch[1])
  if (isNaN(spread)) return null

  const adjustedHome = homeScore + spread
  if (adjustedHome === awayScore) return null // push
  return adjustedHome > awayScore ? 0 : 1    // 0 = home covered, 1 = away covered
}

async function recomputeUserStats(
  supabase: ReturnType<typeof getServiceClient>,
  userIds: string[]
) {
  for (const userId of userIds) {
    const { data: picks } = await supabase
      .from('picks')
      .select('result, option_index, question_id, questions!inner(sport, correct_option)')
      .eq('user_id', userId)
      .neq('result', 'pending')

    if (!picks?.length) continue

    const typedPicks = picks as unknown as {
      result: string
      option_index: number
      question_id: string
      questions: { sport: string; correct_option: number | null } | null
    }[]

    const total = typedPicks.length
    const correct = typedPicks.filter((p) => p.result === 'win').length
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

    // vs community — compare user accuracy to crowd accuracy on same questions
    // Crowd pick = option with the most votes at resolution time
    const questionIds = typedPicks.map((p) => p.question_id)
    const { data: consensusRows } = await supabase
      .from('consensus')
      .select('question_id, option_index, vote_count')
      .in('question_id', questionIds)

    const crowdPickMap: Record<string, number> = {}
    if (consensusRows) {
      const byQuestion: Record<string, { option_index: number; vote_count: number }[]> = {}
      for (const row of consensusRows as { question_id: string; option_index: number; vote_count: number }[]) {
        if (!byQuestion[row.question_id]) byQuestion[row.question_id] = []
        byQuestion[row.question_id].push(row)
      }
      for (const [qId, rows] of Object.entries(byQuestion)) {
        const top = rows.reduce((a, b) => (a.vote_count >= b.vote_count ? a : b))
        crowdPickMap[qId] = top.option_index
      }
    }

    let crowdCorrect = 0
    for (const pick of typedPicks) {
      const correctOption = pick.questions?.correct_option
      const crowdPick = crowdPickMap[pick.question_id]
      if (correctOption !== null && correctOption !== undefined && crowdPick !== undefined) {
        if (crowdPick === correctOption) crowdCorrect++
      }
    }

    const crowdAccuracy = total > 0 ? Math.round((crowdCorrect / total) * 100) : 0
    const vsCommunity = accuracy - crowdAccuracy

    // Per-sport breakdown
    const breakdown: Record<string, { total: number; correct: number }> = {}
    for (const pick of typedPicks) {
      const sport = pick.questions?.sport ?? 'unknown'
      if (!breakdown[sport]) breakdown[sport] = { total: 0, correct: 0 }
      breakdown[sport].total++
      if (pick.result === 'win') breakdown[sport].correct++
    }

    // Streak — walk picks in reverse order
    const { data: orderedPicks } = await supabase
      .from('picks')
      .select('result')
      .eq('user_id', userId)
      .neq('result', 'pending')
      .order('picked_at', { ascending: false })

    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0
    let streakLocked = false

    for (const p of orderedPicks ?? []) {
      if (p.result === 'win') {
        tempStreak++
        if (!streakLocked) currentStreak = tempStreak
        longestStreak = Math.max(longestStreak, tempStreak)
      } else {
        if (!streakLocked) streakLocked = true
        tempStreak = 0
      }
    }

    await supabase.from('user_stats').upsert({
      user_id: userId,
      total_picks: total,
      correct_picks: correct,
      accuracy_pct: accuracy,
      vs_community_pct: vsCommunity,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      sport_breakdown: breakdown,
      updated_at: new Date().toISOString(),
    })
  }
}

// Called by Vercel cron. Vercel sends Authorization: Bearer <CRON_SECRET>;
// manual triggers may also use x-cron-secret for convenience.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const manual = req.headers.get('x-cron-secret')
  if (bearer !== `Bearer ${cronSecret}` && manual !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const debug = new URL(req.url).searchParams.get('debug') === '1'
  return runResolver(debug)
}

// Also allow manual POST trigger (e.g. for testing)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runResolver()
}

async function runResolver(debug = false) {
  const supabase = getServiceClient()
  const results = { resolved: 0, skipped: 0, errors: 0 }
  const debugLog: string[] = []

  // Fetch scores for all sports defined in config
  const allScores = await Promise.all(ALL_ODDS_API_KEYS.map((key) => fetchScores(key)))
  const completedGames = allScores.flat().filter((g) => g.completed && g.scores)

  const externalIds = completedGames.map((g) => g.id)

  // Find unresolved questions for completed games
  const { data: questions } = await supabase
    .from('questions')
    .select(`
      id,
      question_type,
      question_text,
      options,
      games!inner(id, external_id, home_team, away_team)
    `)
    .in('status', ['open', 'closed'])
    .is('correct_option', null)
    .in('question_type', ['over_under', 'game_line', 'match_winner'])

  const affectedUsers = new Set<string>()

  for (const question of questions as unknown as {
    id: string
    question_type: string
    question_text: string
    options: { label: string }[]
    games: { id: string; external_id: string; home_team: string; away_team: string }
  }[]) {
    const game = completedGames.find((g) => g.id === question.games.external_id)
    if (!game || !game.scores) { results.skipped++; continue }

    const homeScore = parseInt(
      game.scores.find((s) => s.name === game.home_team)?.score ?? '0'
    )
    const awayScore = parseInt(
      game.scores.find((s) => s.name === game.away_team)?.score ?? '0'
    )

    let correctOption: number | null = null

    if (question.question_type === 'over_under') {
      correctOption = resolveOverUnder(question.options, homeScore, awayScore)
    } else if (question.question_type === 'game_line') {
      correctOption = resolveGameLine(question.options, game.home_team, homeScore, awayScore)
    } else if (question.question_type === 'match_winner') {
      correctOption = resolveMatchWinner(question.options, game.home_team, game.away_team, homeScore, awayScore)
    }

    if (correctOption === null) { results.skipped++; continue }

    // Mark question resolved
    await supabase
      .from('questions')
      .update({ correct_option: correctOption, status: 'resolved' })
      .eq('id', question.id)

    // Mark picks win/loss
    const { data: winPicks } = await supabase
      .from('picks')
      .update({ result: 'win' })
      .eq('question_id', question.id)
      .eq('option_index', correctOption)
      .select('user_id')

    const { data: lossPicks } = await supabase
      .from('picks')
      .update({ result: 'loss' })
      .eq('question_id', question.id)
      .neq('option_index', correctOption)
      .select('user_id')

    for (const p of [...(winPicks ?? []), ...(lossPicks ?? [])]) {
      affectedUsers.add(p.user_id)
    }

    results.resolved++
  }

  // === Player Prop Resolution via ESPN Stats API ===
  // Find open player props whose game time has already passed
  const { data: openProps } = await supabase
    .from('questions')
    .select(`
      id,
      question_text,
      stat,
      options,
      sport,
      games!inner(id, home_team, away_team, starts_at)
    `)
    .eq('status', 'open')
    .eq('question_type', 'player_prop')
    .is('correct_option', null)
    .lt('closes_at', new Date().toISOString())

  if (debug) {
    const { data: nbaProps } = await supabase
      .from('questions')
      .select('question_text, closes_at')
      .eq('status', 'open')
      .eq('question_type', 'player_prop')
      .eq('sport', 'nba')
      .is('correct_option', null)
      .ilike('question_text', '%Alvarado%')
      .limit(10)
    debugLog.push(`openProps_count=${openProps?.length ?? 0} now=${new Date().toISOString()} alvarado_nba=${nbaProps?.map(p=>p.question_text.slice(0,30)+'@'+p.closes_at).join('|')}`)
  }
  if (openProps?.length) {
    type PropRow = {
      id: string
      question_text: string
      stat: string | null
      options: { label: string }[]
      sport: string
      games: { id: string; home_team: string; away_team: string; starts_at: string }
    }

    // Group by sport → game so we batch ESPN requests per game
    const byGame = new Map<string, { sport: string; home: string; away: string; date: string; props: PropRow[] }>()
    for (const prop of openProps as unknown as PropRow[]) {
      // Supabase may return the join as an array — normalise to a single object
      const gameRow = Array.isArray(prop.games) ? prop.games[0] : prop.games
      if (!gameRow?.id) continue
      const gameId = gameRow.id
      if (!byGame.has(gameId)) {
        const dateStr = gameRow.starts_at.slice(0, 10).replace(/-/g, '')
        byGame.set(gameId, {
          sport: prop.sport,
          home: gameRow.home_team,
          away: gameRow.away_team,
          date: dateStr,
          props: [],
        })
      }
      byGame.get(gameId)!.props.push(prop)
    }

    // Cache ESPN scoreboard per sport+date to avoid duplicate fetches
    const espnScoreboardCache = new Map<string, Awaited<ReturnType<typeof fetchEspnGamesForDate>>>()

    for (const [, { sport, home, away, date, props }] of byGame) {
      const cacheKey = `${sport}:${date}`
      if (!espnScoreboardCache.has(cacheKey)) {
        espnScoreboardCache.set(cacheKey, await fetchEspnGamesForDate(sport, date))
      }
      const espnGames = espnScoreboardCache.get(cacheKey) ?? []

      const espnGame = espnGames.find(
        (g) => teamsMatch(g.homeTeam, home) && teamsMatch(g.awayTeam, away)
      )
      if (!espnGame) {
        if (debug) debugLog.push(`NO_ESPN_GAME sport=${sport} date=${date} home=${home} away=${away} espnGames=${espnGames.map(g=>g.homeTeam+'/'+g.awayTeam).join('|')}`)
        results.skipped += props.length; continue
      }

      const playerStats = await fetchEspnPlayerStats(sport, espnGame.espnEventId)
      if (!playerStats.length) {
        if (debug) debugLog.push(`NO_ESPN_STATS sport=${sport} eventId=${espnGame.espnEventId}`)
        results.skipped += props.length; continue
      }

      for (const prop of props) {
        const playerName = extractPlayerName(prop.question_text)
        // Soccer Yes/No props embed the line in the question text ("Raul Jimenez 0.5+ shots on target?")
        // All other props store it in options[0].label ("Over 2.5")
        const isYesNo = prop.options[0]?.label === 'Yes'
        const lineRaw = isYesNo
          ? (prop.question_text.match(/(\d+\.?\d*)\+?/)?.[1] ?? '')
          : (prop.options[0]?.label.replace(/^Over\s*/i, '') ?? '')
        const line = parseFloat(lineRaw)
        if (!playerName || isNaN(line)) {
          if (debug) debugLog.push(`BAD_PARSE q=${prop.question_text} player=${playerName} line=${line}`)
          results.skipped++; continue
        }

        // Use stat column when available; fall back to parsing from question_text
        // (props seeded before the stat column existed will have stat = null)
        const statLabel = prop.stat ?? extractStatFromQuestion(prop.question_text)
        const correctOption = resolvePlayerProp(playerName, statLabel, line, playerStats)
        if (correctOption === null) {
          if (debug) debugLog.push(`NO_MATCH player=${playerName} stat=${statLabel} line=${line}`)
          results.skipped++; continue
        }

        await supabase
          .from('questions')
          .update({ correct_option: correctOption, status: 'resolved' })
          .eq('id', prop.id)

        const { data: winPicks } = await supabase
          .from('picks')
          .update({ result: 'win' })
          .eq('question_id', prop.id)
          .eq('option_index', correctOption)
          .select('user_id')

        const { data: lossPicks } = await supabase
          .from('picks')
          .update({ result: 'loss' })
          .eq('question_id', prop.id)
          .neq('option_index', correctOption)
          .select('user_id')

        for (const p of [...(winPicks ?? []), ...(lossPicks ?? [])]) {
          affectedUsers.add((p as { user_id: string }).user_id)
        }
        results.resolved++
      }
    }
  }

  // Recompute stats for all affected users
  if (affectedUsers.size) {
    await recomputeUserStats(supabase, Array.from(affectedUsers))
  }

  const out: Record<string, unknown> = { ...results, usersUpdated: affectedUsers.size }
  if (debug && debugLog.length) out.debug = debugLog.slice(0, 50)
  return NextResponse.json(out)
}
