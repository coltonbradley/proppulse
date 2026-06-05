import { ODDS_API_TO_SPORT, SPORTS_CONFIG } from './sports.config'

const BASE_URL = 'https://api.the-odds-api.com/v4'

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
  outcomes: { name: string; price: number; point?: number }[]
}

export type OddsApiSportKey = string

function getConfigForApiKey(apiKey: string) {
  const sportKey = ODDS_API_TO_SPORT[apiKey]
  return SPORTS_CONFIG.find((s) => s.key === sportKey)
}

export async function fetchGames(apiSportKey: string) {
  const config = getConfigForApiKey(apiSportKey)
  const regions = config?.oddsRegions ?? 'us,ca'
  const res = await fetch(
    `${BASE_URL}/sports/${apiSportKey}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=${regions}&markets=h2h,spreads,totals`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)
  return res.json() as Promise<OddsApiGame[]>
}

export async function fetchPlayerProps(apiSportKey: string, eventId: string) {
  const config = getConfigForApiKey(apiSportKey)
  const markets = config?.playerPropMarkets
  if (!markets) return null
  const res = await fetch(
    `${BASE_URL}/sports/${apiSportKey}/events/${eventId}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=${markets}`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)
  return res.json()
}
