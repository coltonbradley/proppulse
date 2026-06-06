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

  // All NHL games in DB
  const { data: nbaGames } = await supabase
    .from('games')
    .select('id, external_id, home_team, away_team, starts_at')
    .eq('sport', 'nhl')
    .order('starts_at')

  // Stat distribution + question text for NHL open props
  const { data: allProps } = await supabase
    .from('questions')
    .select('stat, options, question_text, closes_at, game_id')
    .eq('sport', 'nhl')
    .eq('question_type', 'player_prop')
    .eq('status', 'open')

  const statMap: Record<string, number> = {}
  const zeroLineProps: string[] = []
  for (const row of allProps ?? []) {
    const s = row.stat ?? 'null'
    statMap[s] = (statMap[s] ?? 0) + 1
    const line = parseFloat((row.options as {label:string}[])[0]?.label?.replace(/^Over\s*/i, '') ?? '')
    if (line === 0 || isNaN(line)) zeroLineProps.push(row.question_text)
  }

  const { data: userStats } = await supabase
    .from('user_stats')
    .select('user_id, total_picks, correct_picks, accuracy_pct, current_streak, profiles!inner(username)')
    .gt('total_picks', 0)
    .order('total_picks', { ascending: false })

  const { data: pickSample } = await supabase
    .from('picks')
    .select('user_id, result, question_id')
    .neq('result', 'pending')
    .limit(20)

  const resultCounts: Record<string, number> = {}
  const { data: allPickResults } = await supabase.from('picks').select('result')
  for (const p of allPickResults ?? []) resultCounts[(p as { result: string }).result] = (resultCounts[(p as { result: string }).result] ?? 0) + 1

  return NextResponse.json({
    user_stats: userStats,
    pick_result_counts: resultCounts,
    resolved_pick_sample: pickSample,
  })
}
