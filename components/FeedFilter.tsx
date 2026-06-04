'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const SPORTS = [
  { key: 'all', label: 'All' },
  { key: 'nba', label: 'NBA' },
  { key: 'nfl', label: 'NFL' },
  { key: 'mlb', label: 'MLB' },
]

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'player_prop', label: 'Props' },
  { key: 'game_line', label: 'Lines' },
  { key: 'over_under', label: 'O/U' },
]

export default function FeedFilter() {
  const router = useRouter()
  const params = useSearchParams()
  const sport = params.get('sport') ?? 'all'
  const type = params.get('type') ?? 'all'

  function setFilter(key: 'sport' | 'type', value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    router.push(`/feed?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-2 pb-3">
      <div className="flex gap-2 overflow-x-auto">
        {SPORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter('sport', s.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
              ${sport === s.key
                ? 'bg-[#D85A30] text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter('type', t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
              ${type === t.key
                ? 'bg-[#185FA5] text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
