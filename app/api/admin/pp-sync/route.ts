import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import type { PPLine } from '@/lib/prizepicks-maps'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  // Accept either cron-secret (server-to-server) or admin session (browser)
  const cronSecret = req.headers.get('x-cron-secret')
  const isCron = cronSecret === process.env.CRON_SECRET

  if (!isCron) {
    const sessionClient = await createSessionClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    const adminEmail = process.env.ADMIN_EMAIL
    if (!user || (adminEmail && user.email !== adminEmail)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = await req.json() as { lines: PPLine[] }
  const lines = body.lines ?? []
  if (!lines.length) {
    return NextResponse.json({ ok: false, error: 'No lines provided' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Replace cache atomically: delete all existing rows, then insert fresh batch
  await supabase.from('pp_lines_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const rows = lines.map((l: PPLine) => ({
    player_name: l.playerName,
    sport: l.sport,
    stat_label: l.statLabel,
    line: l.line,
    pp_game_id: l.ppGameId ?? null,
    game_starts_at: l.gameStartsAt ?? null,
    player_team_full: l.playerTeamFull ?? null,
  }))

  const { error } = await supabase.from('pp_lines_cache').insert(rows)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, synced: rows.length })
}
