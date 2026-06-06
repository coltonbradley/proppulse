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

  const db = serviceClient()

  let currentUserId: string | null = null
  try {
    const session = await createClient()
    const { data: { user } } = await session.auth.getUser()
    currentUserId = user?.id ?? null
  } catch { /* not authenticated */ }

  const { start, end } = getPeriodRange(period)
  const minPicks = MIN_PICKS[period] ?? 1

  // Longest active streak — always global, used for summary bar
  const { data: streakTop } = await db
    .from('user_stats')
    .select('user_id, current_streak, profiles!inner(username)')
    .order('current_streak', { ascending: false })
    .limit(1)
    .single()

  // ── All-Time: user_stats is the authoritative source ──────────────────────
  // Raw picks may have gaps (deleted questions cascade to picks) so user_stats
  // is more reliable for all-time totals. We still compute against_herd from
  // whatever resolved picks remain.
  if (period === 'alltime') {
    type StatsRow = {
      user_id: string
      total_picks: number
      correct_picks: number
      accuracy_pct: number
      current_streak: number
      profiles: { username: string } | null
    }
    let statsQuery = db
      .from('user_stats')
      .select('user_id, total_picks, correct_picks, accuracy_pct, current_streak, profiles!inner(username)')
      .gte('total_picks', minPicks)

    const { data: statsRows } = await statsQuery
    const rows = (statsRows ?? []) as unknown as StatsRow[]

    if (rows.length === 0) return NextResponse.json(EMPTY([]))

    const allUserIds = rows.map(r => r.user_id)

    // Against-the-herd: compute from all resolved picks that still exist
    const CHUNK = 400
    type PickRow = { user_id: string; question_id: string; option_index: number; result: string }
    const allPicks: PickRow[] = []
    const { data: resolvedQIds } = await db
      .from('picks')
      .select('question_id')
      .in('result', ['win', 'loss'])
      .in('user_id', allUserIds)
    const qIds = [...new Set((resolvedQIds ?? []).map((r: { question_id: string }) => r.question_id))]

    if (qIds.length > 0) {
      for (let i = 0; i < qIds.length; i += CHUNK) {
        const { data } = await db
          .from('picks')
          .select('user_id, question_id, option_index, result')
          .in('question_id', qIds.slice(i, i + CHUNK))
          .in('result', ['win', 'loss'])
        if (data) allPicks.push(...(data as PickRow[]))
      }
    }

    // Consensus for majority vote
    type ConsRow = { question_id: string; option_index: number; vote_count: number }
    const allCons: ConsRow[] = []
    if (qIds.length > 0) {
      for (let i = 0; i < qIds.length; i += CHUNK) {
        const { data } = await db
          .from('consensus')
          .select('question_id, option_index, vote_count')
          .in('question_id', qIds.slice(i, i + CHUNK))
        if (data) allCons.push(...(data as ConsRow[]))
      }
    }
    const consByQ = new Map<string, { opt: number; count: number }[]>()
    for (const c of allCons) {
      if (!consByQ.has(c.question_id)) consByQ.set(c.question_id, [])
      consByQ.get(c.question_id)!.push({ opt: c.option_index, count: c.vote_count })
    }
    const majorityByQ = new Map<string, number>()
    for (const [qId, opts] of consByQ) {
      majorityByQ.set(qId, opts.reduce((a, b) => (a.count >= b.count ? a : b)).opt)
    }

    const againstHerdByUser = new Map<string, number>()
    for (const pick of allPicks) {
      if (pick.result === 'win') {
        const majority = majorityByQ.get(pick.question_id)
        if (majority !== undefined && pick.option_index !== majority) {
          againstHerdByUser.set(pick.user_id, (againstHerdByUser.get(pick.user_id) ?? 0) + 1)
        }
      }
    }

    // Sport filter for All-Time: filter by sport breakdown in user_stats
    // If sport = 'all', include everyone; otherwise only users with picks in that sport
    let filteredRows = rows
    if (sport !== 'all') {
      const { data: sportQs } = await db
        .from('questions')
        .select('id')
        .eq('sport', sport)
        .not('correct_option', 'is', null)
      const sportQIds = new Set((sportQs ?? []).map((q: { id: string }) => q.id))
      const usersWithSportPicks = new Set(
        allPicks.filter(p => sportQIds.has(p.question_id)).map(p => p.user_id)
      )
      filteredRows = rows.filter(r => usersWithSportPicks.has(r.user_id))
    }

    const ranked: LeaderboardEntry[] = filteredRows
      .map(r => ({
        rank: 0,
        user_id: r.user_id,
        username: (r.profiles as unknown as { username: string } | null)?.username ?? 'Anonymous',
        correct_picks: r.correct_picks,
        total_picks: r.total_picks,
        accuracy_pct: r.accuracy_pct,
        current_streak: r.current_streak,
        against_herd: againstHerdByUser.get(r.user_id) ?? 0,
        wilson_score: wilsonScore(r.correct_picks, r.total_picks),
      }))
      .sort((a, b) => b.wilson_score - a.wilson_score)
      .map((e, i) => ({ ...e, rank: i + 1 }))

    let yourEntry: LeaderboardEntry | null = null
    let yourRank: number | null = null
    if (currentUserId) {
      const idx = ranked.findIndex(e => e.user_id === currentUserId)
      if (idx >= 0) { yourRank = idx + 1; if (idx >= 25) yourEntry = ranked[idx] }
    }

    const top25 = ranked.slice(0, 25)
    const availableSports: string[] = [] // all-time sport chip not practical without full DB scan

    return NextResponse.json({
      entries: top25,
      yourEntry,
      yourRank,
      summary: {
        totalPicks: rows.reduce((s, r) => s + r.total_picks, 0),
        topAccuracy: top25[0]?.accuracy_pct ?? 0,
        longestStreak: streakTop?.current_streak ?? 0,
        longestStreakUser: (streakTop?.profiles as unknown as { username: string } | null)?.username ?? '',
      },
      availableSports,
    })
  }

  // ── Weekly / Season: compute from raw picks in the date range ────────────
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

  type ConsRow = { question_id: string; option_index: number; vote_count: number }
  const allCons: ConsRow[] = []
  for (let i = 0; i < questionIds.length; i += CHUNK) {
    const { data } = await db
      .from('consensus')
      .select('question_id, option_index, vote_count')
      .in('question_id', questionIds.slice(i, i + CHUNK))
    if (data) allCons.push(...(data as ConsRow[]))
  }

  const consByQ = new Map<string, { opt: number; count: number }[]>()
  for (const c of allCons) {
    if (!consByQ.has(c.question_id)) consByQ.set(c.question_id, [])
    consByQ.get(c.question_id)!.push({ opt: c.option_index, count: c.vote_count })
  }
  const majorityByQ = new Map<string, number>()
  for (const [qId, opts] of consByQ) {
    majorityByQ.set(qId, opts.reduce((a, b) => (a.count >= b.count ? a : b)).opt)
  }

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

  const userIds = Array.from(userStats.keys())
  const [{ data: profiles }, { data: streakRows }] = await Promise.all([
    db.from('profiles').select('id, username').in('id', userIds),
    db.from('user_stats').select('user_id, current_streak').in('user_id', userIds),
  ])
  const profileMap = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]))
  const streakMap = new Map((streakRows ?? []).map((s: { user_id: string; current_streak: number }) => [s.user_id, s.current_streak]))

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

  let yourEntry: LeaderboardEntry | null = null
  let yourRank: number | null = null
  if (currentUserId) {
    const idx = ranked.findIndex(e => e.user_id === currentUserId)
    if (idx >= 0) { yourRank = idx + 1; if (idx >= 25) yourEntry = ranked[idx] }
  }

  const top25 = ranked.slice(0, 25)

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
