import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${process.env.ODDS_API_KEY}&daysFrom=3`
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

// Called by Vercel cron every 30 minutes
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runResolver()
}

// Also allow manual POST trigger (e.g. for testing)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runResolver()
}

async function runResolver() {
  const supabase = getServiceClient()
  const results = { resolved: 0, skipped: 0, errors: 0 }

  // Fetch scores for all supported sports
  const [nbaScores, nflScores, nhlScores, eplScores, mlsScores] = await Promise.all([
    fetchScores('basketball_nba'),
    fetchScores('americanfootball_nfl'),
    fetchScores('icehockey_nhl'),
    fetchScores('soccer_epl'),
    fetchScores('soccer_usa_mls'),
  ])

  const completedGames = [...nbaScores, ...nflScores, ...nhlScores, ...eplScores, ...mlsScores].filter(
    (g) => g.completed && g.scores
  )

  if (!completedGames.length) return NextResponse.json({ ...results })

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
    .in('question_type', ['over_under', 'game_line'])

  if (!questions?.length) return NextResponse.json({ ...results })

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
      correctOption = resolveGameLine(
        question.options,
        game.home_team,
        homeScore,
        awayScore
      )
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

  // Recompute stats for all affected users
  if (affectedUsers.size) {
    await recomputeUserStats(supabase, Array.from(affectedUsers))
  }

  return NextResponse.json({ ...results, usersUpdated: affectedUsers.size })
}
