export type SportConfig = {
  key: string            // internal DB value used in questions.sport
  label: string          // display label in UI
  oddsApiKeys: string[]  // one or more Odds API sport keys that map to this sport
  oddsRegions: string    // regions param for the Odds API odds endpoint
  playerPropMarkets?: string  // comma-separated Odds API market keys for player props
}

export const SPORTS_CONFIG: SportConfig[] = [
  {
    key: 'nba',
    label: 'NBA',
    oddsApiKeys: ['basketball_nba'],
    oddsRegions: 'us,ca',
    playerPropMarkets: 'player_points,player_rebounds,player_assists',
  },
  {
    key: 'nfl',
    label: 'NFL',
    oddsApiKeys: ['americanfootball_nfl'],
    oddsRegions: 'us,ca',
    playerPropMarkets: 'player_pass_tds,player_rush_yds,player_rec_yds',
  },
  {
    key: 'mlb',
    label: 'MLB',
    oddsApiKeys: ['baseball_mlb'],
    oddsRegions: 'us,ca',
    playerPropMarkets: 'player_hits,player_total_bases,player_strikeouts',
  },
  {
    key: 'nhl',
    label: 'NHL',
    oddsApiKeys: ['icehockey_nhl'],
    oddsRegions: 'us,ca',
    playerPropMarkets: 'player_goals,player_assists,player_shots_on_goal',
  },
  {
    key: 'soccer',
    label: 'Soccer',
    oddsApiKeys: ['soccer_epl', 'soccer_usa_mls', 'soccer_fifa_world_cup'],
    oddsRegions: 'uk,eu,us',
    playerPropMarkets: 'player_goal_scorer_anytime,player_shots_on_target,player_total_shots',
  },
]

// Odds API key → internal sport key (e.g. 'basketball_nba' → 'nba')
export const ODDS_API_TO_SPORT: Record<string, string> = Object.fromEntries(
  SPORTS_CONFIG.flatMap((s) => s.oddsApiKeys.map((k) => [k, s.key]))
)

// All Odds API keys across all sports
export const ALL_ODDS_API_KEYS = SPORTS_CONFIG.flatMap((s) => s.oddsApiKeys)

// Internal sport key → SportConfig lookup
export const SPORT_BY_KEY: Record<string, SportConfig> = Object.fromEntries(
  SPORTS_CONFIG.map((s) => [s.key, s])
)
