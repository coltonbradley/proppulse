import type { LeaderboardEntry } from '@/lib/leaderboard'

type Props = {
  entries: LeaderboardEntry[]
  currentUserId?: string
  // Pass a rank override for the "You" pinned row so it shows #142 instead of #1
  youRankOverride?: number
}

const RANK_TEXT = ['text-yellow-400', 'text-gray-300', 'text-amber-600']
const RANK_BORDER = ['border-l-yellow-400', 'border-l-gray-300', 'border-l-amber-600']

export default function Leaderboard({ entries, currentUserId, youRankOverride }: Props) {
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
      {entries.map((entry) => {
        const displayRank = youRankOverride ?? entry.rank
        const rankIdx = displayRank - 1
        const isCurrentUser = !!currentUserId && currentUserId === entry.user_id
        const rankColor = RANK_TEXT[rankIdx] ?? 'text-gray-600'
        const borderClass = rankIdx < 3 ? `border-l-2 ${RANK_BORDER[rankIdx]}` : ''
        const wrong = entry.total_picks - entry.correct_picks

        return (
          <div
            key={`${entry.user_id}-${displayRank}`}
            className={`bg-gray-900 rounded-xl p-4 flex items-center gap-4 ${borderClass} ${
              isCurrentUser ? 'ring-1 ring-[#D85A30]/40 bg-gray-800/60' : ''
            }`}
          >
            <div className="flex flex-col items-center w-7 shrink-0">
              <span className={`text-lg font-bold leading-tight ${rankColor}`}>{displayRank}</span>
              {isCurrentUser && (
                <span className="text-[9px] font-semibold text-[#D85A30] uppercase tracking-wide">You</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{entry.username}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-xs text-gray-400">
                  {entry.correct_picks}-{wrong}
                  <span className="text-gray-600 ml-1.5">· {entry.total_picks} picks</span>
                </span>
                {entry.current_streak > 2 && (
                  <span className="text-[11px] text-[#D85A30]">🔥{entry.current_streak}</span>
                )}
                {entry.against_herd > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-teal-900/50 text-teal-400">
                    Beat herd {entry.against_herd}x
                  </span>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-[#D85A30]">{entry.accuracy_pct}%</p>
              <p className="text-xs text-gray-500">accuracy</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
