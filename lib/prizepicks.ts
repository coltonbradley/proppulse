import { createClient } from '@supabase/supabase-js'
import { PP_STAT_MAP, PP_LEAGUE_SPORT } from './prizepicks-maps'

export type { PPLine } from './prizepicks-maps'
export { PP_STAT_MAP, PP_LEAGUE_SPORT }

// Reads PrizePicks standard-board lines from the Supabase cache.
// The cache is populated by the browser-side admin sync (/admin page).
export async function fetchPrizePicksLines(): Promise<Map<string, import('./prizepicks-maps').PPLine>> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('pp_lines_cache')
      .select('player_name, sport, stat_label, line, pp_game_id, game_starts_at, player_team_full')

    if (error) {
      console.error('pp_lines_cache read error:', error.message)
      return new Map()
    }

    const result = new Map<string, import('./prizepicks-maps').PPLine>()
    for (const row of data ?? []) {
      const key = `${(row.player_name as string).toLowerCase()}:${row.stat_label}`
      result.set(key, {
        playerName: row.player_name as string,
        sport: row.sport as string,
        statLabel: row.stat_label as string,
        line: row.line as number,
        ppGameId: row.pp_game_id as string ?? undefined,
        gameStartsAt: row.game_starts_at as string ?? undefined,
        playerTeamFull: row.player_team_full as string ?? undefined,
      })
    }
    return result
  } catch (err) {
    console.error('fetchPrizePicksLines error:', err instanceof Error ? err.message : String(err))
    return new Map()
  }
}
