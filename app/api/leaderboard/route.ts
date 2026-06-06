import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getPeriodRange, wilsonScore, MIN_PICKS, type LeaderboardEntry } from '@/lib/leaderboard'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const EMPTY = (availableSports: string[]) => ({
  entries: [],
  yourEntry: null,
  yourRank: null,
  summary: { totalPicks: 0, topAccuracy: 0, longestStreak: 0, longestStreakUser: '' },
  availableSports,
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') ?? 'weekly'
  const sport = searchParams.get('sport') ?? 'all'

  // Service role bypasses picks RLS (SELECT USING auth.uid() = user_id)
  const db = serviceClient()

  // Current user for "You" row — session cookie, best-effort
  let currentUserId: string | null = null
  try {
    const session = await createClient()
    const { data: { user } } = await session.auth.getUser()
    currentUserId = user?.id ?? null
  } catch { /* not authenticated */ }

  const { start, end } = getPeriodRange(period)
  const minPicks = MIN_PICKS[period] ?? 3

  // Questions in period — no correct_option filter; pick.result is the source of truth for resolution
  const { data: allQs } = await db
    .from('questions')
    .select('id, sport')
    .gte('closes_at', start)
    .lte('closes_at', end)

  const periodQs = (allQs ?? []) as { id: string; sport: string }[]
  const availableSports = [...new Set(periodQs.map(q => q.sport))].filter(Boolean).sort() as string[]

  const filteredQs = sport === 'all' ? periodQs : periodQs.filter(q => q.sport === sport)
  const questionIds = filteredQs.map(q => q.id)

  if (questionIds.length === 0) return NextResponse.json(EMPTY(availableSports))

  // Picks — service role reads ALL users' picks despite RLS
  const CHUNK = 400
  type PickRow = { user_id: string; question_id: string; option_index: number; result: string }
  const allPicks: PickRow[] = []
  for (let i = 0; i < questionIds.length; i += CHUNK) {
    const { data } = await db
      .from('picks')
      .select('user_id, question_id, option_index, result')
      .in('question_id', questionIds.slice(i, i + CHUNK))
      .in('result', ['win', 'loss'])
    if (data) allPicks.push(...(data as PickRow[]))
  }

  if (allPicks.length === 0) return NextResponse.json(EMPTY(availableSports))

  // Consensus — publicly readable, used for majority vote detection
  type ConsRow = { question_id: string; option_index: number; vote_count: number }
  const allCons: ConsRow[] = []
  for (let i = 0; i < questionIds.length; i += CHUNK) {
    const { data } = await db
      .from('consensus')
      .select('question_id, option_index, vote_count')
      .in('question_id', questionIds.slice(i, i + CHUNK))
    if (data) allCons.push(...(data as ConsRow[]))
  }

  // Majority option per question
  const consByQ = new Map<string, { opt: number; count: number }[]>()
  for (const c of allCons) {
    if (!consByQ.has(c.question_id)) consByQ.set(c.question_id, [])
    consByQ.get(c.question_id)!.push({ opt: c.option_index, count: c.vote_count })
  }
  const majorityByQ = new Map<string, number>()
  for (const [qId, opts] of consByQ) {
    majorityByQ.set(qId, opts.reduce((a, b) => (a.count >= b.count ? a : b)).opt)
  }

  // Aggregate per-user stats
  const userStats = new Map<string, { correct: number; total: number; against_herd: number }>()
  for (const pick of allPicks) {
    if (!userStats.has(pick.user_id)) userStats.set(pick.user_id, { correct: 0, total: 0, against_herd: 0 })
    const s = userStats.get(pick.user_id)!
    s.total++
    if (pick.result === 'win') {
      s.correct++
      const majority = majorityByQ.get(pick.question_id)
      if (majority !== undefined && pick.option_index !== majority) s.against_herd++
    }
  }

  // Profiles + current streaks
  const userIds = Array.from(userStats.keys())
  const [{ data: profiles }, { data: streakRows }] = await Promise.all([
    db.from('profiles').select('id, username').in('id', userIds),
    db.from('user_stats').select('user_id, current_streak').in('user_id', userIds),
  ])
  const profileMap = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]))
  const streakMap = new Map((streakRows ?? []).map((s: { user_id: string; current_streak: number }) => [s.user_id, s.current_streak]))

  // Build ranked list sorted by Wilson score
  const ranked: LeaderboardEntry[] = Array.from(userStats.entries())
    .filter(([, s]) => s.total >= minPicks)
    .map(([uid, s]) => ({
      rank: 0,
      user_id: uid,
      username: profileMap.get(uid) ?? 'Anonymous',
      correct_picks: s.correct,
      total_picks: s.total,
      accuracy_pct: Math.round((100 * s.correct) / s.total),
      current_streak: streakMap.get(uid) ?? 0,
      against_herd: s.against_herd,
      wilson_score: wilsonScore(s.correct, s.total),
    }))
    .sort((a, b) => b.wilson_score - a.wilson_score)
    .map((e, i) => ({ ...e, rank: i + 1 }))

  // "You" row
  let yourEntry: LeaderboardEntry | null = null
  let yourRank: number | null = null
  if (currentUserId) {
    const idx = ranked.findIndex(e => e.user_id === currentUserId)
    if (idx >= 0) {
      yourRank = idx + 1
      if (idx >= 25) yourEntry = ranked[idx]
    }
  }

  const top25 = ranked.slice(0, 25)

  // Longest active streak (global — not period-filtered)
  const { data: streakTop } = await db
    .from('user_stats')
    .select('user_id, current_streak, profiles!inner(username)')
    .order('current_streak', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    entries: top25,
    yourEntry,
    yourRank,
    summary: {
      totalPicks: allPicks.length,
      topAccuracy: top25[0]?.accuracy_pct ?? 0,
      longestStreak: streakTop?.current_streak ?? 0,
      longestStreakUser: (streakTop?.profiles as unknown as { username: string } | null)?.username ?? '',
    },
    availableSports,
  })
}
