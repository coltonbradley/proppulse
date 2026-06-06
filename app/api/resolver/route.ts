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
  if (total === line) return null
  return total > line ? 0 : 1
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
  const spreadMatch = options[0].label.match(/([+-]?\d+\.?\d*)$/)
  if (!spreadMatch) return null
  const spread = parseFloat(spreadMatch[1])
  if (isNaN(spread)) return null
  const adjustedHome = homeScore + spread
  if (adjustedHome === awayScore) return null
  return adjustedHome > awayScore ? 0 : 1
}

function getBracket(majorityPct: number): string {
  if (majorityPct >= 80) return '80%+'
  if (majorityPct >= 70) return '70-79%'
  if (majorityPct >= 60) return '60-69%'
  return '50-59%'
}

async function insertConsensusResult(
  supabase: ReturnType<typeof getServiceClient>,
  questionId: string,
  correctOption: number,
  sport: string,
  propType: string
) {
  const { data: consRows } = await supabase
    .from('consensus')
    .select('option_index, vote_count, pct')
    .eq('question_id', questionId)

  if (!consRows?.length) return

  type CRow = { option_index: number; vote_count: number; pct: number }
  const rows = consRows as CRow[]
  const totalVotes = rows.reduce((s, r) => s + r.vote_count, 0)
  if (totalVotes === 0) return

  const majority = rows.reduce((a, b) => (a.vote_count >= b.vote_count ? a : b))
  const majorityPct = majority.pct > 0
    ? majority.pct
    : Math.round((majority.vote_count / totalVotes) * 100)

  await supabase.from('consensus_results').insert({
    question_id: questionId,
    winning_option_index: correctOption,
    total_votes: totalVotes,
    crowd_was_correct: majority.option_index === correctOption,
    consensus_bracket: getBracket(majorityPct),
    sport,
    prop_type: propType,
    majority_pct: majorityPct,
  })
}

async function recomputeUserStats(
  supabase: ReturnType<typeof getServiceClient>,
  userIds: string[]
) {
  for (const userId of userIds) {
    const { data: picks } = await supabase
      .from('picks')
      .select('result, option_index, question_id, community_pct_at_vote, questions!inner(sport, correct_option, question_type, stat)')
      .eq('user_id', userId)
      .in('result', ['win', 'loss'])

    if (!picks?.length) continue

    const typedPicks = picks as unknown as {
      result: string
      option_index: number
      question_id: string
      community_pct_at_vote: number | null
      questions: { sport: string; correct_option: number | null; question_type: string; stat: string | null } | null
    }[]

    const total = typedPicks.length
    const correct = typedPicks.filter((p) => p.result === 'win').length
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

    // vs community
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

    // Streaks
    const { data: orderedPicks } = await supabase
      .from('picks')
      .select('result')
      .eq('user_id', userId)
      .in('result', ['win', 'loss'])
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

    // Fade vs Follow — based on community_pct_at_vote
    // community_pct_at_vote = % of voters who picked the same option as the user at vote time
    let fadeWins = 0, fadePicks = 0
    let followWins = 0, followPicks = 0
    let contrarianWins = 0, contrarianTotal = 0

    for (const pick of typedPicks) {
      const pct = pick.community_pct_at_vote
      if (pct === null || pct === undefined) continue
      if (pct < 50) {
        fadePicks++
        if (pick.result === 'win') fadeWins++
        if (pct < 40) {
          contrarianTotal++
          if (pick.result === 'win') contrarianWins++
        }
      } else {
        followPicks++
        if (pick.result === 'win') followWins++
      }
    }

    const fadeAccuracy = fadePicks > 0 ? Math.round((fadeWins / fadePicks) * 100) : 0
    const followAccuracy = followPicks > 0 ? Math.round((followWins / followPicks) * 100) : 0
    const contrarianScore = contrarianTotal > 0 ? Math.round((contrarianWins / contrarianTotal) * 100) : 0

    // Best sport (min 3 picks)
    let bestSport: string | null = null
    let bestSportPct = -1
    for (const [sport, data] of Object.entries(breakdown)) {
      if (data.total >= 3) {
        const pct = Math.round((data.correct / data.total) * 100)
        if (pct > bestSportPct) { bestSportPct = pct; bestSport = sport }
      }
    }

    // Best prop type — use stat for player props, question_type for others (min 3 picks)
    const propBreakdown: Record<string, { total: number; correct: number }> = {}
    for (const pick of typedPicks) {
      const q = pick.questions
      const pt = q?.stat ?? q?.question_type ?? 'unknown'
      if (!propBreakdown[pt]) propBreakdown[pt] = { total: 0, correct: 0 }
      propBreakdown[pt].total++
      if (pick.result === 'win') propBreakdown[pt].correct++
    }
    let bestPropType: string | null = null
    let bestPropPct = -1
    for (const [pt, data] of Object.entries(propBreakdown)) {
      if (data.total >= 3) {
        const pct = Math.round((data.correct / data.total) * 100)
        if (pct > bestPropPct) { bestPropPct = pct; bestPropType = pt }
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
      fade_accuracy: fadeAccuracy,
      follow_accuracy: followAccuracy,
      best_sport: bestSport,
      best_prop_type: bestPropType,
      contrarian_score: contrarianScore,
      total_fade_picks: fadePicks,
      total_follow_picks: followPicks,
      updated_at: new Date().toISOString(),
    })
  }
}

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

  const allScores = await Promise.all(ALL_ODDS_API_KEYS.map((key) => fetchScores(key)))
  const completedGames = allScores.flat().filter((g) => g.completed && g.scores)

  const { data: questions } = await supabase
    .from('questions')
    .select(`
      id,
      sport,
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
    sport: string
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

    await supabase
      .from('questions')
      .update({ correct_option: correctOption, status: 'resolved' })
      .eq('id', question.id)

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

    await insertConsensusResult(supabase, question.id, correctOption, question.sport, question.question_type)

    results.resolved++
  }

  // === Player Prop Resolution via ESPN Stats API ===
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

    const byGame = new Map<string, { sport: string; home: string; away: string; date: string; props: PropRow[] }>()
    for (const prop of openProps as unknown as PropRow[]) {
      const gameRow = Array.isArray(prop.games) ? prop.games[0] : prop.games
      if (!gameRow?.id) continue
      const gameId = gameRow.id
      if (!byGame.has(gameId)) {
        const dateStr = gameRow.starts_at.slice(0, 10).replace(/-/g, '')
        byGame.set(gameId, { sport: prop.sport, home: gameRow.home_team, away: gameRow.away_team, date: dateStr, props: [] })
      }
      byGame.get(gameId)!.props.push(prop)
    }

    const espnScoreboardCache = new Map<string, Awaited<ReturnType<typeof fetchEspnGamesForDate>>>()

    for (const [, { sport, home, away, date, props }] of byGame) {
      const cacheKey = `${sport}:${date}`
      if (!espnScoreboardCache.has(cacheKey)) {
        espnScoreboardCache.set(cacheKey, await fetchEspnGamesForDate(sport, date))
      }
      const espnGames = espnScoreboardCache.get(cacheKey) ?? []

      const espnGame =
        espnGames.find((g) => teamsMatch(g.homeTeam, home) && teamsMatch(g.awayTeam, away)) ??
        espnGames.find((g) => teamsMatch(g.homeTeam, away) && teamsMatch(g.awayTeam, home))
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
        const playerName = extractPlayerName(prop.question_text, prop.stat)
        const isYesNo = prop.options[0]?.label === 'Yes'
        const lineRaw = isYesNo
          ? (prop.question_text.match(/(\d+\.?\d*)\+?/)?.[1] ?? '')
          : (prop.options[0]?.label.replace(/^Over\s*/i, '') ?? '')
        const line = parseFloat(lineRaw)
        if (!playerName || isNaN(line)) {
          if (debug) debugLog.push(`BAD_PARSE q=${prop.question_text} player=${playerName} line=${line}`)
          results.skipped++; continue
        }

        const statLabel = prop.stat ?? extractStatFromQuestion(prop.question_text)
        const correctOption = resolvePlayerProp(playerName, statLabel, line, playerStats)
        if (correctOption === null) {
          if (debug) debugLog.push(`NO_MATCH player=${playerName} stat=${statLabel} line=${line}`)
          results.skipped++; continue
        }

        if (correctOption === 'push') {
          if (debug) debugLog.push(`PUSH player=${playerName} stat=${statLabel} line=${line}`)
          await supabase
            .from('questions')
            .update({ status: 'resolved' })
            .eq('id', prop.id)
          const { data: pushPicks } = await supabase
            .from('picks')
            .update({ result: 'push' })
            .eq('question_id', prop.id)
            .select('user_id')
          for (const p of pushPicks ?? []) {
            affectedUsers.add((p as { user_id: string }).user_id)
          }
          results.resolved++
          continue
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

        await insertConsensusResult(supabase, prop.id, correctOption, sport, prop.stat ?? 'player_prop')

        results.resolved++
      }
    }
  }

  if (affectedUsers.size) {
    await recomputeUserStats(supabase, Array.from(affectedUsers))
  }

  const out: Record<string, unknown> = { ...results, usersUpdated: affectedUsers.size }
  if (debug && debugLog.length) out.debug = debugLog.slice(0, 50)
  return NextResponse.json(out)
}
