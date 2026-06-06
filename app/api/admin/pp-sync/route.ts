import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PP_STAT_MAP, PP_LEAGUE_SPORT, type PPLine } from '@/lib/prizepicks-maps'
import { cookies } from 'next/headers'


function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type RawProjection = {
  type: string
  id: string
  attributes: {
    odds_type: string
    stat_type: string
    line_score: number
    start_time?: string
  }
  relationships: {
    new_player?: { data?: { id: string } }
    new_game?: { data?: { id: string } }
    game?: { data?: { id: string } }
  }
}

type RawIncluded = {
  type: string
  id: string
  attributes: {
    display_name?: string
    name?: string
    league?: string
    combo?: boolean
    team_name?: string
    start_time?: string
    starts_at?: string
  }
}

function parsePrizePicksLines(raw: { data: RawProjection[]; included: RawIncluded[] }): PPLine[] {
  const players: Record<string, RawIncluded['attributes']> = {}

  for (const item of raw.included ?? []) {
    if (item.type === 'new_player') players[item.id] = item.attributes
  }

  const result = new Map<string, PPLine>()
  for (const proj of raw.data ?? []) {
    const attr = proj.attributes
    if (attr.odds_type !== 'standard') continue

    const statType = attr.stat_type
    if (!statType || statType.includes('(Combo)')) continue

    const statLabel = PP_STAT_MAP[statType]
    if (!statLabel) continue

    const pid = proj.relationships?.new_player?.data?.id
    if (!pid) continue
    const player = players[pid]
    if (!player) continue

    const league = player.league
    if (!league) continue
    const sport = PP_LEAGUE_SPORT[league]
    if (!sport) continue

    const playerName = player.display_name ?? player.name ?? ''
    if (!playerName || playerName.includes('+')) continue

    const line = attr.line_score
    if (!line || line <= 0) continue

    const playerTeamFull = player.team_name ?? undefined
    const gameStartsAt = attr.start_time ?? undefined
    const gameRelId = proj.relationships?.new_game?.data?.id ?? proj.relationships?.game?.data?.id
    const ppGameId = gameRelId ?? undefined

    const key = `${playerName.toLowerCase()}:${statLabel}`
    const existing = result.get(key)
    if (!existing || line > existing.line) {
      result.set(key, { playerName, sport, statLabel, line, ppGameId, gameStartsAt, playerTeamFull })
    }
  }

  return Array.from(result.values())
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret')
  if (secret && secret === process.env.CRON_SECRET) return true

  // Session-based check: read user from cookie
  const { createServerClient } = await import('@supabase/ssr')
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmail = process.env.ADMIN_EMAIL
  return !!(user && (!adminEmail || user.email === adminEmail))
}

async function storeLines(lines: PPLine[]) {
  const supabase = getServiceClient()
  await supabase.from('pp_lines_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const rows = lines.map((l) => ({
    player_name: l.playerName,
    sport: l.sport,
    stat_label: l.statLabel,
    line: l.line,
    pp_game_id: l.ppGameId ?? null,
    game_starts_at: l.gameStartsAt ?? null,
    player_team_full: l.playerTeamFull ?? null,
  }))
  return supabase.from('pp_lines_cache').insert(rows)
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let ppData: { data: RawProjection[]; included: RawIncluded[] }
    try {
      const ppRes = await fetch(
        'https://api.prizepicks.com/projections?single_stat=true&per_page=1000',
        { cache: 'no-store' }
      )
      if (!ppRes.ok) throw new Error(`PrizePicks HTTP ${ppRes.status}`)
      ppData = await ppRes.json()
    } catch (err) {
      const msg = `PP fetch failed: ${err instanceof Error ? err.message : String(err)}`
      console.error('[pp-sync]', msg)
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }

    const lines = parsePrizePicksLines(ppData)
    if (!lines.length) {
      return NextResponse.json({ ok: false, error: 'PP returned 0 parseable lines' }, { status: 502 })
    }

    const { error: dbErr } = await storeLines(lines)
    if (dbErr) {
      console.error('[pp-sync] db error:', dbErr.message)
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, synced: lines.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pp-sync GET fatal]', msg)
    return NextResponse.json({ ok: false, error: `Fatal: ${msg}` }, { status: 500 })
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://app.prizepicks.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-sync-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  try {
    // Allow browser bookmarklet via x-sync-key header
    const syncKey = req.headers.get('x-sync-key')
    const authed =
      (syncKey && syncKey === process.env.CRON_SECRET) ||
      (await isAdmin(req))
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
    }

    const body = await req.json() as { lines?: PPLine[]; ppData?: unknown }
    let lines: PPLine[]

    if (body.ppData) {
      // Raw PP JSON from browser bookmarklet — parse server-side
      lines = parsePrizePicksLines(body.ppData as { data: RawProjection[]; included: RawIncluded[] })
    } else {
      lines = body.lines ?? []
    }

    if (!lines.length) {
      return NextResponse.json({ ok: false, error: 'No parseable lines' }, { status: 400, headers: CORS_HEADERS })
    }

    const { error: dbErr } = await storeLines(lines)
    if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500, headers: CORS_HEADERS })
    return NextResponse.json({ ok: true, synced: lines.length }, { headers: CORS_HEADERS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: `Fatal: ${msg}` }, { status: 500, headers: CORS_HEADERS })
  }
}
