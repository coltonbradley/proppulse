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

export type OddsApiSportKey =
  | 'basketball_nba'
  | 'americanfootball_nfl'
  | 'baseball_mlb'
  | 'icehockey_nhl'
  | 'soccer_epl'
  | 'soccer_usa_mls'
  | 'soccer_fifa_world_cup'

const SOCCER_SPORTS = new Set<OddsApiSportKey>(['soccer_epl', 'soccer_usa_mls', 'soccer_fifa_world_cup'])

export async function fetchGames(sport: OddsApiSportKey) {
  const regions = SOCCER_SPORTS.has(sport) ? 'uk,eu,us' : 'us,ca'
  const res = await fetch(
    `${BASE_URL}/sports/${sport}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=${regions}&markets=h2h,spreads,totals`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)
  return res.json() as Promise<OddsApiGame[]>
}

const PLAYER_PROP_MARKETS: Partial<Record<OddsApiSportKey, string>> = {
  basketball_nba: 'player_points,player_rebounds,player_assists',
  americanfootball_nfl: 'player_pass_tds,player_rush_yds,player_rec_yds',
  icehockey_nhl: 'player_goals,player_assists,player_shots_on_goal',
  soccer_fifa_world_cup: 'player_goal_scorer_anytime,player_shots_on_target,player_total_shots',
}

export async function fetchPlayerProps(sport: OddsApiSportKey, eventId: string) {
  const markets = PLAYER_PROP_MARKETS[sport]
  if (!markets) return null
  const res = await fetch(
    `${BASE_URL}/sports/${sport}/events/${eventId}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=${markets}`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)
  return res.json()
}
