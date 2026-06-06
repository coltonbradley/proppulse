/**
 * PrizePicks line sync agent.
 *
 * Fetches the current standard-tier PrizePicks board from your local machine
 * (residential IP bypasses Cloudflare), processes the lines, and pushes them
 * to the Supabase cache via the pp-sync endpoint so the seeder uses accurate lines.
 *
 * Usage:
 *   node --env-file=.env.local scripts/sync-prizepicks.mjs
 *
 * Schedule (runs every 3 hours via macOS cron — edit with `crontab -e`):
 *   0 *\/3 * * * cd /Users/courtneypickell/Desktop/proppulse && node --env-file=.env.local scripts/sync-prizepicks.mjs >> /tmp/pp-sync.log 2>&1
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local if CRON_SECRET isn't already in the environment
if (!process.env.CRON_SECRET) {
  try {
    const envPath = resolve(__dirname, '../.env.local')
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env.local missing — rely on environment variables being set
  }
}

const CRON_SECRET = process.env.CRON_SECRET
const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
// Always target production — localhost is a dev-only value
const APP_URL = (!rawAppUrl || rawAppUrl.includes('localhost')) ? 'https://proppulse-lovat.vercel.app' : rawAppUrl

if (!CRON_SECRET) {
  console.error('ERROR: CRON_SECRET is not set. Add it to .env.local or the environment.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// PrizePicks stat + league maps (mirrors lib/prizepicks-maps.ts)
// ---------------------------------------------------------------------------

const PP_STAT_MAP = {
  'Points': 'points',
  'Rebounds': 'rebounds',
  'Assists': 'assists',
  'Steals': 'steals',
  'Blocks': 'blocks',
  'Pts+Rebs+Asts': 'Pts+Rebs+Asts',
  'Pts+Rebs': 'Pts+Rebs',
  'Pts+Asts': 'Pts+Asts',
  'Rebs+Asts': 'Rebs+Asts',
  'Goals':              'goals',
  'Goalie Saves':       'saves',
  'Shots On Goal':      'shots on goal',
  'Hits':               'hits',
  'Pitcher Strikeouts': 'pitcher strikeouts',
  'Hits+Runs+RBIs':     'hits+runs+rbis',
  'Runs':               'runs',
  'RBIs':               'rbis',
  'Home Runs':          'home runs',
  'Shots On Target':    'shots on target',
  'Shots':              'shots',
}

const PP_LEAGUE_SPORT = {
  'NBA': 'nba',
  'NFL': 'nfl',
  'NHL': 'nhl',
  'MLB': 'mlb',
  'WORLD CUP':      'soccer',
  'WORLD CUP TRNY': 'soccer',
}

// ---------------------------------------------------------------------------
// Fetch PrizePicks
// ---------------------------------------------------------------------------

async function fetchPrizePicks() {
  console.log('Fetching PrizePicks standard lines...')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch('https://api.prizepicks.com/projections?single_stat=true', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://app.prizepicks.com/',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }

    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Parse into standard lines
// ---------------------------------------------------------------------------

function parseLines(data) {
  const players = {}
  for (const item of data.included ?? []) {
    if (item.type === 'new_player') {
      players[item.id] = item.attributes
    }
  }

  const result = new Map()

  for (const proj of data.data ?? []) {
    const attr = proj.attributes
    if (attr.odds_type !== 'standard') continue

    const statType = attr.stat_type
    if (!statType || statType.includes('(Combo)')) continue

    const statLabel = PP_STAT_MAP[statType]
    if (!statLabel) continue

    const pid = proj.relationships?.new_player?.data?.id
    const player = players[pid]
    if (!player) continue

    const sport = PP_LEAGUE_SPORT[player.league]
    if (!sport) continue

    const playerName = player.display_name ?? player.name ?? ''
    if (!playerName || playerName.includes('+')) continue

    const line = attr.line_score
    if (!line || line <= 0) continue

    const key = `${playerName.toLowerCase()}:${statLabel}`
    const existing = result.get(key)
    if (!existing || line > existing.line) {
      result.set(key, {
        playerName,
        sport,
        statLabel,
        line,
        ppGameId: attr.game_id ?? null,
        gameStartsAt: attr.start_time ?? null,
        playerTeamFull: player.team_name ?? null,
      })
    }
  }

  return Array.from(result.values())
}

// ---------------------------------------------------------------------------
// Push to pp-sync endpoint
// ---------------------------------------------------------------------------

async function pushLines(lines) {
  console.log(`Pushing ${lines.length} lines to ${APP_URL}/api/admin/pp-sync ...`)
  const res = await fetch(`${APP_URL}/api/admin/pp-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
    },
    body: JSON.stringify({ lines }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`pp-sync returned ${res.status}: ${text}`)
  }

  return await res.json()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  const data = await fetchPrizePicks()
  const lines = parseLines(data)
  console.log(`Parsed ${lines.length} standard lines across ${new Set(lines.map(l => l.sport)).size} sports.`)

  const result = await pushLines(lines)
  console.log(`Done. Synced ${result.synced} lines. (${new Date().toISOString()})`)
} catch (err) {
  console.error('sync-prizepicks failed:', err.message)
  process.exit(1)
}
