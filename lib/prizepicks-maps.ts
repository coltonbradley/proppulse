// Shared PrizePicks constants used by both server (seeder) and client (admin sync button).

export const PP_STAT_MAP: Record<string, string> = {
  // NBA
  'Points':           'points',
  'Rebounds':         'rebounds',
  'Assists':          'assists',
  'Steals':           'steals',
  'Blocks':           'blocks',
  'Pts+Rebs+Asts':    'Pts+Rebs+Asts',
  'Pts+Rebs':         'Pts+Rebs',
  'Pts+Asts':         'Pts+Asts',
  'Rebs+Asts':        'Rebs+Asts',
  // NHL
  'Goals':              'goals',
  'Goalie Saves':       'saves',
  'Shots On Goal':      'shots on goal',
  // MLB
  'Hits':               'hits',
  'Pitcher Strikeouts': 'pitcher strikeouts',
  'Hits+Runs+RBIs':     'hits+runs+rbis',
  'Runs':               'runs',
  'RBIs':               'rbis',
  'Home Runs':          'home runs',
  // Soccer / World Cup
  'Shots On Target':    'shots on target',
  'Shots':              'shots',
  // Goals + Assists for WORLD CUP TRNY are already covered by NHL/NBA entries above
}

export const PP_LEAGUE_SPORT: Record<string, string> = {
  'NBA':       'nba',
  'NFL':       'nfl',
  'NHL':       'nhl',
  'MLB':       'mlb',
  'WORLD CUP':      'soccer',
  'WORLD CUP TRNY': 'soccer_tournament',
}

export type PPLine = {
  playerName: string
  sport: string
  statLabel: string
  line: number
  ppGameId?: string
  gameStartsAt?: string
  playerTeamFull?: string  // e.g. "San Antonio Spurs" — matches The Odds API home_team/away_team
}
