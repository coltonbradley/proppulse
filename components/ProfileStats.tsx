type UserStats = {
  total_picks: number
  correct_picks: number
  accuracy_pct: number
  vs_community_pct: number
  current_streak: number
  longest_streak: number
  sport_breakdown: Record<string, { total: number; correct: number }>
}

type Props = { stats: UserStats }

export default function ProfileStats({ stats }: Props) {
  const vsPositive = stats.vs_community_pct > 0
  const vsNeutral = stats.vs_community_pct === 0

  return (
    <div className="space-y-4">
      {/* Hero: vs community score */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
          vs. the crowd
        </p>
        <p className={`text-5xl font-bold ${vsNeutral ? 'text-gray-400' : vsPositive ? 'text-green-400' : 'text-red-400'}`}>
          {vsPositive ? '+' : ''}{stats.vs_community_pct}%
        </p>
        <p className="text-sm text-gray-500 mt-2">
          {vsNeutral
            ? 'Picking right alongside the crowd'
            : vsPositive
            ? `Outperforming the crowd by ${stats.vs_community_pct}%`
            : `Crowd is beating you by ${Math.abs(stats.vs_community_pct)}%`}
        </p>
      </div>

      {/* Supporting stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Accuracy', value: `${stats.accuracy_pct}%` },
          { label: 'Correct', value: `${stats.correct_picks}/${stats.total_picks}` },
          { label: 'Streak', value: stats.current_streak, sub: `best ${stats.longest_streak}` },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            {s.sub && <p className="text-xs text-gray-600 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Per-sport breakdown */}
      {Object.keys(stats.sport_breakdown).length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">By Sport</h3>
          {Object.entries(stats.sport_breakdown).map(([sport, data]) => {
            const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0
            return (
              <div key={sport} className="flex items-center justify-between">
                <span className="text-sm text-white uppercase">{sport}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[#D85A30] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm text-gray-400 w-16 text-right">
                    {data.correct}/{data.total} · {pct}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
