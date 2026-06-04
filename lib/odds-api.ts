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

export async function fetchGames(sport: 'basketball_nba' | 'americanfootball_nfl' | 'baseball_mlb') {
  const res = await fetch(
    `${BASE_URL}/sports/${sport}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)
  return res.json() as Promise<OddsApiGame[]>
}

export async function fetchPlayerProps(
  sport: 'basketball_nba' | 'americanfootball_nfl',
  eventId: string
) {
  const res = await fetch(
    `${BASE_URL}/sports/${sport}/events/${eventId}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=player_points,player_rebounds,player_assists,player_pass_tds,player_rush_yds,player_rec_yds`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)
  return res.json()
}
