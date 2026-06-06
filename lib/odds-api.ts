import { ODDS_API_TO_SPORT, SPORTS_CONFIG } from './sports.config'

const PARLAY_BASE = 'https://parlay-api.com/v1'
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'

function parlayHeaders() {
  return { 'X-API-Key': process.env.PARLAY_API_KEY! }
}

export type OddsApiGame = {
  id: string
  sport_key: string
  home_team: string
  away_team: string
  commence_time: string
  bookmakers: OddsApiBookmaker[]
}

type OddsApiBookmaker = {
  key: string
  markets: OddsApiMarket[]
}

type OddsApiMarket = {
  key: string
  outcomes: { name: string; price: number; point?: number; description?: string }[]
}

export type OddsApiSportKey = string

type ParlayPropRow = {
  bookmaker: string
  player: string
  market_key: string
  line: number
  over_price: number
  under_price: number
  canonical_event_id: string
}

function getConfigForApiKey(apiKey: string) {
  const sportKey = ODDS_API_TO_SPORT[apiKey]
  return SPORTS_CONFIG.find((s) => s.key === sportKey)
}

// Per-stat caps for sanity-checking prop lines (catches bad API data)
const STAT_LINE_CAPS: Record<string, number> = {
  // NBA
  'player_points':           55,
  'player_rebounds':         25,
  'player_assists':          20,
  'player_steals':           6,
  'player_blocks':           8,
  'player_pts_rebs_asts':    80,
  'player_pts_rebs':         70,
  'player_pts_asts':         70,
  'player_rebs_asts':        40,
  // NHL
  'player_shots_on_goal':    12,
  'player_saves':            50,
  // MLB
  'player_strikeouts':       15,
  'player_hits':             5,
  'player_home_runs':        3,
  // Soccer
  'player_goals':            5,
  'player_shots_on_target':  8,
}

// Transform ParlayAPI flat prop rows into the bookmaker-nested shape
// that seedPlayerProps in app/api/odds/route.ts expects.
// Uses the median line across all bookmakers to avoid single-book outliers.
function transformParlayProps(rows: ParlayPropRow[]) {
  if (!rows.length) return null

  // Group all rows by market_key+player to collect all bookmaker lines
  const linesByPlayerMarket = new Map<string, number[]>()
  const rowMeta = new Map<string, ParlayPropRow>() // first row metadata per player+market

  for (const row of rows) {
    const key = `${row.market_key}:${row.player}`
    if (!linesByPlayerMarket.has(key)) {
      linesByPlayerMarket.set(key, [])
      rowMeta.set(key, row)
    }
    linesByPlayerMarket.get(key)!.push(row.line)
  }

  const marketMap = new Map<string, { name: string; price: number; point: number; description: string }[]>()

  for (const [key, lines] of linesByPlayerMarket) {
    const meta = rowMeta.get(key)!
    const cap = STAT_LINE_CAPS[meta.market_key]

    // Use median line to avoid single-book outliers
    const sorted = [...lines].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianLine = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]

    // Skip if the median line itself exceeds the per-stat cap
    if (cap !== undefined && medianLine > cap) continue

    if (!marketMap.has(meta.market_key)) marketMap.set(meta.market_key, [])
    const outcomes = marketMap.get(meta.market_key)!
    outcomes.push(
      { name: 'Over',  price: meta.over_price,  point: medianLine, description: meta.player },
      { name: 'Under', price: meta.under_price, point: medianLine, description: meta.player },
    )
  }

  const markets = Array.from(marketMap.entries()).map(([key, outcomes]) => ({ key, outcomes }))
  return { bookmakers: [{ key: rows[0].bookmaker, markets }] }
}

export async function fetchGames(apiSportKey: string) {
  const config = getConfigForApiKey(apiSportKey)
  const regions = config?.oddsRegions ?? 'us,ca'

  // Soccer uses The Odds API so game IDs match when fetching props later
  if (config?.apiSource === 'oddsapi') {
    const res = await fetch(
      `${ODDS_API_BASE}/sports/${apiSportKey}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=${regions}&markets=h2h,spreads,totals`,
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`Odds API error: ${res.status}`)
    return res.json() as Promise<OddsApiGame[]>
  }

  const res = await fetch(
    `${PARLAY_BASE}/sports/${apiSportKey}/odds?regions=${regions}&markets=h2h,spreads,totals`,
    { cache: 'no-store', headers: parlayHeaders() }
  )
  if (!res.ok) throw new Error(`Parlay API error: ${res.status}`)
  return res.json() as Promise<OddsApiGame[]>
}

export async function fetchPlayerProps(apiSportKey: string, eventId: string) {
  const config = getConfigForApiKey(apiSportKey)
  const markets = config?.playerPropMarkets
  if (!markets) return null

  // Soccer props use The Odds API (UK/EU regions) — game IDs also come from Odds API so they match
  if (config?.apiSource === 'oddsapi') {
    const regions = config.oddsRegions ?? 'uk,eu,us'
    const res = await fetch(
      `${ODDS_API_BASE}/sports/${apiSportKey}/events/${eventId}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=${regions}&markets=${markets}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return null
    return res.json()
  }

  // Default: ParlayAPI (flat row format → transform to nested bookmaker shape)
  const res = await fetch(
    `${PARLAY_BASE}/sports/${apiSportKey}/props?markets=${markets}&eventId=${eventId}`,
    { next: { revalidate: 300 }, headers: parlayHeaders() }
  )
  if (!res.ok) return null
  const rows = await res.json() as ParlayPropRow[]
  return transformParlayProps(rows)
}
