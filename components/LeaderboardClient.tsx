'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Leaderboard from '@/components/Leaderboard'
import { PERIOD_LABELS, MIN_PICKS, type LeaderboardResponse } from '@/lib/leaderboard'

const SPORT_LABELS: Record<string, string> = {
  nba: 'NBA', nfl: 'NFL', mlb: 'MLB', nhl: 'NHL', soccer: 'Soccer',
}

export default function LeaderboardClient() {
  const [period, setPeriod] = useState('weekly')
  const [sport, setSport] = useState('all')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
  }, [])

  const fetchData = useCallback(async (p: string, s: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leaderboard?period=${p}&sport=${s}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(period, sport) }, [period, sport, fetchData])

  const changePeriod = (p: string) => { setPeriod(p); setSport('all') }

  const entries = data?.entries ?? []
  const minPicks = MIN_PICKS[period] ?? 3

  return (
    <div className="space-y-4">
      {/* Title + dynamic subtitle */}
      <div>
        <h1 className="text-xl font-bold text-white">Top Pickers</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Min. {minPicks} picks required · {PERIOD_LABELS[period]}
        </p>
      </div>

      {/* Period toggle */}
      <div className="flex gap-1 p-1 bg-gray-800/60 rounded-xl">
        {(['weekly', 'season', 'alltime'] as const).map(p => (
          <button
            key={p}
            onClick={() => changePeriod(p)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              period === p ? 'bg-[#D85A30] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Sport chips — horizontally scrollable */}
      <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {['all', ...(data?.availableSports ?? [])].map(s => (
          <button
            key={s}
            onClick={() => setSport(s)}
            className={`shrink-0 px-3 py-1 text-sm rounded-full border transition-colors ${
              sport === s
                ? 'bg-[#D85A30] border-[#D85A30] text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}
          >
            {s === 'all' ? 'All' : (SPORT_LABELS[s] ?? s.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Summary stats bar */}
      {data?.summary && (
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-800/60 rounded-xl px-3 py-2 text-center">
            <p className="text-base font-bold text-white">{data.summary.totalPicks.toLocaleString()}</p>
            <p className="text-[11px] text-gray-500">picks</p>
          </div>
          <div className="flex-1 bg-gray-800/60 rounded-xl px-3 py-2 text-center">
            <p className="text-base font-bold text-[#D85A30]">{data.summary.topAccuracy}%</p>
            <p className="text-[11px] text-gray-500">top accuracy</p>
          </div>
          <div className="flex-1 bg-gray-800/60 rounded-xl px-3 py-2 text-center">
            <p className="text-base font-bold text-white">
              🔥<span className="text-[#D85A30]">{data.summary.longestStreak}</span>
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {data.summary.longestStreakUser || 'streak'}
            </p>
          </div>
        </div>
      )}

      {/* Rankings */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-base font-medium text-white">No rankings yet.</p>
          <p className="text-sm mt-1">Make {minPicks} or more picks to appear here.</p>
        </div>
      ) : (
        <>
          <Leaderboard entries={entries} currentUserId={currentUserId ?? undefined} />

          {/* "You" pinned row — shown only when current user is outside top 25 */}
          {data?.yourEntry && data.yourRank && (
            <div className="mt-2">
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-600">your rank</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <Leaderboard
                entries={[data.yourEntry]}
                currentUserId={currentUserId ?? undefined}
                youRankOverride={data.yourRank}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
