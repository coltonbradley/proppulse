export const CURRENT_SEASON_START = '2025-10-01T00:00:00Z'

export const MIN_PICKS: Record<string, number> = {
  weekly: 3,
  season: 15,
  alltime: 25,
}

export const PERIOD_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  season: 'This Season',
  alltime: 'All-Time',
}

export function getPeriodRange(period: string): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString()

  if (period === 'weekly') {
    const day = now.getDay() // 0=Sun … 6=Sat
    const daysFromMonday = day === 0 ? 6 : day - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - daysFromMonday)
    monday.setHours(0, 0, 0, 0)
    return { start: monday.toISOString(), end }
  }

  if (period === 'season') {
    return { start: CURRENT_SEASON_START, end }
  }

  return { start: '2020-01-01T00:00:00Z', end }
}

// Wilson score lower bound (z=1.96). Ranks by confidence, not raw %.
export function wilsonScore(correct: number, total: number): number {
  if (total === 0) return 0
  const wrong = total - correct
  return (
    (correct + 1.9208) / (total + 3.8416) -
    (1.96 * Math.sqrt((correct * wrong / total + 0.9604) / (total + 3.8416))) /
    (1 + 3.8416 / total)
  )
}

export type LeaderboardEntry = {
  rank: number
  user_id: string
  username: string
  correct_picks: number
  total_picks: number
  accuracy_pct: number
  current_streak: number
  against_herd: number
  wilson_score: number
}

export type LeaderboardSummary = {
  totalPicks: number
  topAccuracy: number
  longestStreak: number
  longestStreakUser: string
}

export type LeaderboardResponse = {
  entries: LeaderboardEntry[]
  yourEntry: LeaderboardEntry | null
  yourRank: number | null
  summary: LeaderboardSummary
  availableSports: string[]
}
