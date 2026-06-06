'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SPORTS_CONFIG } from '@/lib/sports.config'
import { getStatConfig } from '@/lib/stat-config'

const SPORTS = [
  { key: 'all', label: 'All' },
  ...SPORTS_CONFIG.map((s) => ({ key: s.key, label: s.label })),
]

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'player_prop', label: 'Props' },
  { key: 'match_winner', label: 'Match Winners' },
]

type Props = { availableStats?: string[] }

export default function FeedFilter({ availableStats = [] }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const sport = params.get('sport') ?? 'all'
  const type = params.get('type') ?? 'all'
  const stat = params.get('stat') ?? 'all'

  function setFilter(key: 'sport' | 'type' | 'stat', value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    // Changing sport resets type and stat filters to avoid empty results
    if (key === 'sport') {
      next.delete('type')
      next.delete('stat')
    }
    // Match Winners has no stat breakdown — clear stat when switching to it
    if (key === 'type' && value === 'match_winner') {
      next.delete('stat')
    }
    router.push(`/feed?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-2 pb-1">
      {/* Sport filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
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

      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
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

      {/* Stat filter — only shown when a specific sport is selected and viewing props */}
      {sport !== 'all' && availableStats.length > 0 && type !== 'match_winner' && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setFilter('stat', 'all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors
              ${stat === 'all'
                ? 'bg-gray-200 text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            All Stats
          </button>
          {availableStats.map((statKey) => {
            const cfg = getStatConfig(statKey)
            const label = cfg?.label ?? statKey.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            const isActive = stat === statKey
            return (
              <button
                key={statKey}
                onClick={() => setFilter('stat', statKey)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border
                  ${isActive
                    ? (cfg?.filter ?? 'bg-gray-200 text-gray-900') + ' border-transparent'
                    : 'bg-gray-800 text-gray-400 hover:text-white border-transparent'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
