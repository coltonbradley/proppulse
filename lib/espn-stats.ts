type EspnSportConfig = { sport: string; league: string }

const ESPN_CONFIGS: Record<string, EspnSportConfig> = {
  nba:    { sport: 'basketball', league: 'nba' },
  nhl:    { sport: 'hockey',     league: 'nhl' },
  mlb:    { sport: 'baseball',   league: 'mlb' },
  nfl:    { sport: 'football',   league: 'nfl' },
  soccer: { sport: 'soccer',     league: 'fifa.world' },
}

// Maps our stat column values to ESPN boxscore key names.
// Optional `group` restricts by statistics group name.
// Optional `groupContainsKey` restricts by whether a specific key is present in
// the group's keys array — used for MLB where ESPN returns null group names.
type StatMapping = { statLabel: string; espnKey: string; group?: string; groupContainsKey?: string }

const ESPN_STAT_KEYS: Record<string, StatMapping[]> = {
  nhl: [
    { statLabel: 'goals',         espnKey: 'goals' },
    { statLabel: 'assists',       espnKey: 'assists' },
    { statLabel: 'shots on goal', espnKey: 'shots' },
    { statLabel: 'saves',         espnKey: 'saves' },
  ],
  nba: [
    { statLabel: 'points',    espnKey: 'points' },
    { statLabel: 'rebounds',  espnKey: 'rebounds' },
    { statLabel: 'assists',   espnKey: 'assists' },
    { statLabel: 'steals',    espnKey: 'steals' },
    { statLabel: 'blocks',    espnKey: 'blocks' },
  ],
  mlb: [
    // ESPN returns null group names for MLB — use groupContainsKey to identify batting vs pitching.
    // Batting group contains 'atBats'; pitching group contains 'fullInnings.partInnings'.
    { statLabel: 'hits',               espnKey: 'hits',       groupContainsKey: 'atBats' },
    { statLabel: 'home runs',          espnKey: 'homeRuns',   groupContainsKey: 'atBats' },
    { statLabel: 'runs',               espnKey: 'runs',       groupContainsKey: 'atBats' },
    { statLabel: 'rbis',               espnKey: 'RBIs',       groupContainsKey: 'atBats' },
    { statLabel: 'pitcher strikeouts', espnKey: 'strikeouts', groupContainsKey: 'fullInnings.partInnings' },
  ],
  nfl: [
    { statLabel: 'pass tds',  espnKey: 'passingTouchdowns' },
    { statLabel: 'rush yds',  espnKey: 'rushingYards' },
    { statLabel: 'rec yds',   espnKey: 'receivingYards' },
  ],
  // Soccer player stats live in rosters[].roster[].stats[] with {name, value} objects.
  // espnKey here is the `name` field on those stat objects.
  soccer: [
    { statLabel: 'goals',           espnKey: 'totalGoals' },
    { statLabel: 'assists',         espnKey: 'goalAssists' },
    { statLabel: 'shots on target', espnKey: 'shotsOnTarget' },
    { statLabel: 'shots',           espnKey: 'totalShots' },
    { statLabel: 'saves',           espnKey: 'saves' },
  ],
}

// Combo stat labels → individual stat labels to sum for resolution.
// Keys are normalised (lowercased) versions of what we store in the stat column.
const COMBO_STAT_MAP: Record<string, string[]> = {
  // Legacy space-separated format (kept for any old questions still in DB)
  'points rebounds assists': ['points', 'rebounds', 'assists'],
  'points rebounds':         ['points', 'rebounds'],
  'rebounds assists':        ['rebounds', 'assists'],
  'points assists':          ['points', 'assists'],
  'pts rebs asts':           ['points', 'rebounds', 'assists'],
  'pts rebs':                ['points', 'rebounds'],
  'rebs asts':               ['rebounds', 'assists'],
  'pts asts':                ['points', 'assists'],
  // Current plus-separated format
  'pts+rebs+asts':           ['points', 'rebounds', 'assists'],
  'pts+rebs':                ['points', 'rebounds'],
  'rebs+asts':               ['rebounds', 'assists'],
  'pts+asts':                ['points', 'assists'],
  // MLB
  'hits+runs+rbis':          ['hits', 'runs', 'rbis'],
}

export type EspnPlayerStat = {
  playerName: string
  statLabel: string
  value: number
}

export type EspnGame = {
  espnEventId: string
  homeTeam: string
  awayTeam: string
}

async function safeFetch(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function teamsMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().trim()
  if (norm(a) === norm(b)) return true
  const lastA = norm(a).split(' ').pop() ?? ''
  const lastB = norm(b).split(' ').pop() ?? ''
  return lastA.length > 2 && lastA === lastB
}

export function extractPlayerName(questionText: string, knownStat?: string | null): string {
  const clean = questionText.replace(/\?$/, '')
  const nameAndStat = clean.split(' — over or under ')[0] ?? clean

  // If we know the stat label, strip it directly — handles uppercase combo stats
  // like "Pts+Rebs+Asts" that the lowercase-detection fallback misses.
  if (knownStat) {
    const idx = nameAndStat.lastIndexOf(knownStat)
    if (idx > 0) return nameAndStat.slice(0, idx).trim()
  }

  // Fallback: split on the first word that starts with a lowercase letter
  const words = nameAndStat.split(' ')
  let splitIdx = words.length
  for (let i = 1; i < words.length; i++) {
    if (words[i] && /^[a-z]/.test(words[i])) { splitIdx = i; break }
  }
  return words.slice(0, splitIdx).join(' ')
}

// Extracts the stat label from question_text for props where stat column is null
export function extractStatFromQuestion(questionText: string): string {
  const clean = questionText.replace(/\?$/, '')
  const nameAndStat = clean.split(' — over or under ')[0] ?? clean
  const words = nameAndStat.split(' ')
  let splitIdx = words.length
  for (let i = 1; i < words.length; i++) {
    if (words[i] && /^[a-z]/.test(words[i])) { splitIdx = i; break }
  }
  return words.slice(splitIdx).join(' ')
}

async function fetchEspnGamesForSingleDate(sport: string, dateStr: string, config: EspnSportConfig): Promise<EspnGame[]> {
  const data = await safeFetch(
    `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/scoreboard?dates=${dateStr}`
  ) as { events?: Record<string, unknown>[] } | null

  if (!data?.events) return []

  const games: EspnGame[] = []
  for (const event of data.events) {
    const competition = (event.competitions as Record<string, unknown>[])?.[0]
    if (!competition) continue
    const completed = ((competition.status as Record<string, unknown>)?.type as Record<string, unknown>)?.completed
    if (!completed) continue

    const competitors = competition.competitors as Record<string, unknown>[]
    const home = competitors?.find((c) => c.homeAway === 'home')
    const away = competitors?.find((c) => c.homeAway === 'away')

    games.push({
      espnEventId: event.id as string,
      homeTeam: ((home?.team as Record<string, unknown>)?.displayName as string) ?? '',
      awayTeam: ((away?.team as Record<string, unknown>)?.displayName as string) ?? '',
    })
  }
  return games
}

// Checks the given UTC date AND the prior day to handle games stored as UTC midnight
// but listed on ESPN under the local calendar date (e.g. 8pm ET = midnight UTC next day)
export async function fetchEspnGamesForDate(sport: string, dateStr: string): Promise<EspnGame[]> {
  const config = ESPN_CONFIGS[sport]
  if (!config) return []

  const d = new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`)
  const prevDate = new Date(d)
  prevDate.setDate(prevDate.getDate() - 1)
  const prevDateStr = prevDate.toISOString().slice(0, 10).replace(/-/g, '')

  const [current, prev] = await Promise.all([
    fetchEspnGamesForSingleDate(sport, dateStr, config),
    fetchEspnGamesForSingleDate(sport, prevDateStr, config),
  ])

  // Deduplicate by espnEventId
  const seen = new Set<string>()
  const combined: EspnGame[] = []
  for (const g of [...current, ...prev]) {
    if (!seen.has(g.espnEventId)) { seen.add(g.espnEventId); combined.push(g) }
  }
  return combined
}

// Parses soccer-specific roster structure: rosters[].roster[].stats[] with {name, value} objects
export function parseSoccerStats(
  data: unknown,
  statMappings: StatMapping[]
): EspnPlayerStat[] {
  const d = data as { rosters?: Record<string, unknown>[] } | null
  if (!d?.rosters) return []

  const results: EspnPlayerStat[] = []

  for (const teamRoster of d.rosters) {
    const roster = (teamRoster.roster as Record<string, unknown>[]) ?? []
    for (const entry of roster) {
      const playerName = ((entry.athlete as Record<string, unknown>)?.displayName as string) ?? ''
      const stats = (entry.stats as Record<string, unknown>[]) ?? []

      for (const { statLabel, espnKey } of statMappings) {
        const stat = stats.find((s) => s.name === espnKey)
        if (!stat) continue
        const value = typeof stat.value === 'number' ? stat.value : parseFloat(stat.value as string) || 0
        results.push({ playerName, statLabel, value })
      }
    }
  }

  return results
}

// Parses the standard boxscore.players structure used by NBA/NFL/NHL/MLB
function parseBoxscoreStats(
  data: unknown,
  statMappings: StatMapping[]
): EspnPlayerStat[] {
  const d = data as { boxscore?: { players?: Record<string, unknown>[] } } | null
  if (!d?.boxscore?.players) return []

  const results: EspnPlayerStat[] = []

  for (const teamEntry of d.boxscore.players) {
    for (const statsGroup of (teamEntry.statistics as Record<string, unknown>[]) ?? []) {
      const groupName = (statsGroup.name as string) ?? ''
      const keys = (statsGroup.keys as string[]) ?? []
      const athletes = (statsGroup.athletes as Record<string, unknown>[]) ?? []

      for (const athleteEntry of athletes) {
        const playerName = ((athleteEntry.athlete as Record<string, unknown>)?.displayName as string) ?? ''
        const rawStats = (athleteEntry.stats as string[]) ?? []

        for (const { statLabel, espnKey, group, groupContainsKey } of statMappings) {
          if (group && groupName !== group) continue
          if (groupContainsKey && !keys.includes(groupContainsKey)) continue

          const idx = keys.indexOf(espnKey)
          if (idx === -1) continue

          const raw = rawStats[idx] ?? ''
          // Some values use "made-attempted" format (e.g. "3-8"); take the first number
          const value = raw.includes('-')
            ? parseInt(raw.split('-')[0] ?? '0')
            : parseFloat(raw) || 0

          results.push({ playerName, statLabel, value })
        }
      }
    }
  }

  return results
}

export async function fetchEspnPlayerStats(sport: string, espnEventId: string): Promise<EspnPlayerStat[]> {
  const config = ESPN_CONFIGS[sport]
  if (!config) return []

  const statMappings = ESPN_STAT_KEYS[sport]
  if (!statMappings?.length) return []

  const data = await safeFetch(
    `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/summary?event=${espnEventId}`
  )

  if (sport === 'soccer') {
    return parseSoccerStats(data, statMappings)
  }

  return parseBoxscoreStats(data, statMappings)
}

// Fetches cumulative player stats across all completed FIFA World Cup games.
// Iterates each date from tournament start to today, collects completed event IDs,
// then fetches per-game stats and sums them per player.
// Called by the tournament resolver once closes_at has passed (after the final).
export async function fetchEspnTournamentCumulativeStats(): Promise<EspnPlayerStat[]> {
  const config = ESPN_CONFIGS.soccer
  const statMappings = ESPN_STAT_KEYS.soccer ?? []
  if (!config || !statMappings.length) return []

  // Collect all dates from World Cup start (June 11) through today
  const dates: string[] = []
  const start = new Date('2026-06-11')
  const today = new Date()
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''))
  }

  // Batch scoreboard fetches to find completed event IDs
  const completedIds = new Set<string>()
  const BATCH = 6
  for (let i = 0; i < dates.length; i += BATCH) {
    const batch = dates.slice(i, i + BATCH)
    const boards = await Promise.all(
      batch.map(ds => safeFetch(
        `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/scoreboard?dates=${ds}`
      ))
    )
    for (const data of boards) {
      const d = data as { events?: Record<string, unknown>[] } | null
      for (const event of d?.events ?? []) {
        const competition = (event.competitions as Record<string, unknown>[])?.[0]
        const completed = ((competition?.status as Record<string, unknown>)?.type as Record<string, unknown>)?.completed
        if (completed) completedIds.add(event.id as string)
      }
    }
  }

  // Fetch per-game stats for every completed event and merge into cumulative totals
  const totals = new Map<string, Map<string, number>>()
  const eventList = Array.from(completedIds)
  for (let i = 0; i < eventList.length; i += BATCH) {
    const batch = eventList.slice(i, i + BATCH)
    const gameStats = await Promise.all(
      batch.map(async id => {
        const data = await safeFetch(
          `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/summary?event=${id}`
        )
        return parseSoccerStats(data, statMappings)
      })
    )
    for (const stats of gameStats) {
      for (const { playerName, statLabel, value } of stats) {
        if (!totals.has(playerName)) totals.set(playerName, new Map())
        const m = totals.get(playerName)!
        m.set(statLabel, (m.get(statLabel) ?? 0) + value)
      }
    }
  }

  // Flatten to EspnPlayerStat[]
  const result: EspnPlayerStat[] = []
  for (const [playerName, statsMap] of totals) {
    for (const [statLabel, value] of statsMap) {
      result.push({ playerName, statLabel, value })
    }
  }
  return result
}

export function resolvePlayerProp(
  playerName: string,
  statLabel: string,
  line: number,
  playerStats: EspnPlayerStat[]
): number | null | 'push' {
  const norm = (s: string) => s.toLowerCase().trim()
  const targetName = norm(playerName)
  const targetLast = targetName.split(' ').pop() ?? ''
  const targetStat = norm(statLabel)

  const playerMatch = (s: EspnPlayerStat) =>
    norm(s.playerName) === targetName ||
    (targetLast.length > 2 && norm(s.playerName).endsWith(targetLast))

  // Combo stat: sum individual stats
  const comboStats = COMBO_STAT_MAP[targetStat]
  if (comboStats) {
    let total = 0
    for (const part of comboStats) {
      const match = playerStats.find((s) => norm(s.statLabel) === part && playerMatch(s))
      if (!match) return null
      total += match.value
    }
    if (total === line) return 'push'
    return total > line ? 0 : 1
  }

  const match = playerStats.find((s) => norm(s.statLabel) === targetStat && playerMatch(s))
  if (!match) return null
  if (match.value === line) return 'push'
  return match.value > line ? 0 : 1
}
