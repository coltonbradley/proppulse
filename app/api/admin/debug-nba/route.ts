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

  return NextResponse.json({
    nhl_games: nbaGames,
    stat_counts: statMap,
    props: (allProps ?? []).map((p) => ({
      text: p.question_text,
      stat: p.stat,
      closes_at: p.closes_at,
      game_id: (p.game_id as string)?.slice(0, 8),
    })),
  })
}
