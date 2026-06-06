'use client'

import { useState } from 'react'
import { PP_STAT_MAP, PP_LEAGUE_SPORT, type PPLine } from '@/lib/prizepicks-maps'

type SyncState = 'idle' | 'fetching' | 'uploading' | 'done' | 'error'

type RawProjection = {
  type: string
  id: string
  attributes: {
    odds_type: string
    stat_type: string
    line_score: number
  }
  relationships: {
    new_player?: { data?: { id: string } }
  }
}

type RawIncluded = {
  type: string
  id: string
  attributes: {
    display_name?: string
    name?: string
    league?: string
    combo?: boolean
  }
}

function parsePrizePicksLines(data: { data: RawProjection[]; included: RawIncluded[] }): PPLine[] {
  const players: Record<string, RawIncluded['attributes']> = {}
  for (const item of data.included ?? []) {
    if (item.type === 'new_player') {
      players[item.id] = item.attributes
    }
  }

  const result = new Map<string, PPLine>()
  for (const proj of data.data ?? []) {
    const attr = proj.attributes
    if (attr.odds_type !== 'standard') continue

    const statType = attr.stat_type
    if (!statType || statType.includes('(Combo)')) continue

    const statLabel = PP_STAT_MAP[statType]
    if (!statLabel) continue

    const pid = proj.relationships?.new_player?.data?.id
    if (!pid) continue
    const player = players[pid]
    if (!player) continue

    const league = player.league
    if (!league) continue
    const sport = PP_LEAGUE_SPORT[league]
    if (!sport) continue

    const playerName = player.display_name ?? player.name ?? ''
    if (!playerName || playerName.includes('+')) continue

    const line = attr.line_score
    if (!line || line <= 0) continue

    const key = `${playerName.toLowerCase()}:${statLabel}`
    const existing = result.get(key)
    if (!existing || line > existing.line) {
      result.set(key, { playerName, sport, statLabel, line })
    }
  }

  return Array.from(result.values())
}

export default function PrizepicksSyncButton() {
  const [state, setState] = useState<SyncState>('idle')
  const [message, setMessage] = useState('')

  async function handleSync() {
    setState('fetching')
    setMessage('Fetching PrizePicks lines from your browser...')

    let data: { data: RawProjection[]; included: RawIncluded[] }
    try {
      const res = await fetch('https://api.prizepicks.com/projections?single_stat=true', {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://app.prizepicks.com/',
        },
      })
      if (!res.ok) throw new Error(`PrizePicks returned ${res.status}`)
      data = await res.json()
    } catch (err) {
      setState('error')
      setMessage(`Failed to fetch PrizePicks: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    const lines = parsePrizePicksLines(data)
    setMessage(`Parsed ${lines.length} standard lines. Uploading to cache...`)
    setState('uploading')

    try {
      const res = await fetch('/api/admin/pp-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
      const result = await res.json() as { ok: boolean; synced?: number; error?: string }
      if (!result.ok) throw new Error(result.error ?? 'Unknown error')
      setState('done')
      setMessage(`Synced ${result.synced} PrizePicks lines to cache.`)
    } catch (err) {
      setState('error')
      setMessage(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const buttonLabel = {
    idle: 'Sync PrizePicks Lines',
    fetching: 'Fetching...',
    uploading: 'Uploading...',
    done: 'Sync Again',
    error: 'Retry Sync',
  }[state]

  const isLoading = state === 'fetching' || state === 'uploading'

  return (
    <div className="space-y-3">
      <button
        onClick={handleSync}
        disabled={isLoading}
        className="w-full px-4 py-3 rounded-lg font-semibold text-sm bg-[#D85A30] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#c24e28] transition-colors"
      >
        {isLoading && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 align-middle" />
        )}
        {buttonLabel}
      </button>
      {message && (
        <p className={`text-sm ${state === 'error' ? 'text-red-400' : state === 'done' ? 'text-green-400' : 'text-gray-400'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
