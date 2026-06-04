type LeaderboardEntry = {
  user_id: string
  accuracy_pct: number
  correct_picks: number
  total_picks: number
  current_streak: number
  profiles: { username: string; avatar_url: string | null } | null
}

type Props = { entries: LeaderboardEntry[] }

export default function Leaderboard({ entries }: Props) {
  if (!entries.length) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-base font-medium text-white">Props loading soon.</p>
        <p className="text-sm mt-1">Rankings will appear once picks are recorded.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, rank) => (
        <div key={entry.user_id} className="bg-gray-900 rounded-xl p-4 flex items-center gap-4">
          <span
            className={`text-lg font-bold w-7 shrink-0 ${
              rank === 0 ? 'text-yellow-400' : rank === 1 ? 'text-gray-300' : rank === 2 ? 'text-amber-600' : 'text-gray-600'
            }`}
          >
            {rank + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate">
              {entry.profiles?.username ?? 'Anonymous'}
            </p>
            <p className="text-xs text-gray-500">
              {entry.correct_picks}/{entry.total_picks} correct
              {entry.current_streak > 2 && (
                <span className="ml-2 text-[#D85A30]">{entry.current_streak} streak</span>
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-[#D85A30]">{entry.accuracy_pct}%</p>
            <p className="text-xs text-gray-500">accuracy</p>
          </div>
        </div>
      ))}
    </div>
  )
}
