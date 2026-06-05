'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import QuestionCard from '@/components/QuestionCard'

const ANON_PICKS_KEY = 'proppulse_anon_picks'

type ConsensusRow = { option_index: number; vote_count: number; pct: number }
type Question = {
  id: string
  game_id: string
  question_text: string
  question_type: string
  stat: string | null
  options: { label: string }[]
  closes_at: string
  status: string
  correct_option: number | null
  consensus: ConsensusRow[]
  userPick: number | null
  games: { home_team: string; away_team: string; starts_at: string } | null
}

type Props = {
  initialQuestions: Question[]
  userId: string | null
}

const TYPE_LABELS: Record<string, string> = {
  player_prop: 'props',
  game_line: 'lines',
  over_under: 'over/unders',
}

const TYPE_ORDER: Record<string, number> = {
  match_winner: 0,
  game_line: 1,
  over_under: 2,
  player_prop: 3,
}

function readAnonPicks(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(ANON_PICKS_KEY) ?? '{}') } catch { return {} }
}

function saveAnonPick(questionId: string, optionIndex: number) {
  const picks = readAnonPicks()
  picks[questionId] = optionIndex
  localStorage.setItem(ANON_PICKS_KEY, JSON.stringify(picks))
}

function formatGameTime(startsAt: string) {
  const d = new Date(startsAt)
  const datePart = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  return `${datePart} · ${timePart}`
}

export default function FeedClient({ initialQuestions, userId }: Props) {
  const supabase = createClient()
  const params = useSearchParams()
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [anonPicks, setAnonPicks] = useState<Record<string, number>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const typeFilter = params.get('type') ?? 'all'
  const typeLabel = TYPE_LABELS[typeFilter] ?? 'props'

  useEffect(() => { setAnonPicks(readAnonPicks()) }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const picks = readAnonPicks()
          const entries = Object.entries(picks)
          if (!entries.length) return
          await Promise.allSettled(
            entries.map(([questionId, optionIndex]) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase as any).rpc('cast_vote_replay', {
                p_question_id: questionId,
                p_option_index: optionIndex,
              })
            )
          )
          localStorage.removeItem(ANON_PICKS_KEY)
          setAnonPicks({})
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (!initialQuestions.length) return
    const channel = supabase
      .channel('consensus-feed')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'consensus' }, (payload) => {
        const updated = payload.new as ConsensusRow & { question_id: string }
        setQuestions((prev) =>
          prev.map((q) => {
            if (q.id !== updated.question_id) return q
            const newConsensus = q.consensus.map((c) =>
              c.option_index === updated.option_index
                ? { ...c, vote_count: updated.vote_count, pct: updated.pct }
                : c
            )
            if (!newConsensus.find((c) => c.option_index === updated.option_index)) {
              newConsensus.push({ option_index: updated.option_index, vote_count: updated.vote_count, pct: updated.pct })
            }
            return { ...q, consensus: newConsensus }
          })
        )
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, initialQuestions.length])

  function handleAnonVote(questionId: string, optionIndex: number) {
    saveAnonPick(questionId, optionIndex)
    setAnonPicks((prev) => ({ ...prev, [questionId]: optionIndex }))
  }

  const q = searchQuery.toLowerCase().trim()
  const filtered = q
    ? questions.filter((question) =>
        question.question_text.toLowerCase().includes(q) ||
        question.games?.home_team.toLowerCase().includes(q) ||
        question.games?.away_team.toLowerCase().includes(q)
      )
    : questions

  const searchBar = (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search teams or players…"
        className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-gray-900 border border-gray-800
                   text-sm text-white placeholder-gray-600
                   focus:outline-none focus:border-[#D85A30] transition-colors"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
          aria-label="Clear search"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )

  if (!questions.length) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium text-white">Props loading soon.</p>
        <p className="text-sm mt-1">Check back closer to tip-off.</p>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="text-center py-12 text-gray-500">
          <p className="text-base">No results for &ldquo;{searchQuery}&rdquo;</p>
          <p className="text-sm mt-1">Try a team name, city, or player name.</p>
        </div>
      </div>
    )
  }

  // When a type filter is active, render flat 2-col grid
  if (typeFilter !== 'all') {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              userId={userId}
              anonPick={anonPicks[q.id] ?? null}
              onAnonVote={handleAnonVote}
            />
          ))}
        </div>
      </div>
    )
  }

  // Group by game_id, sort games by start time
  const gameMap = new Map<string, Question[]>()
  for (const q of filtered) {
    const existing = gameMap.get(q.game_id) ?? []
    gameMap.set(q.game_id, [...existing, q])
  }

  // Sort questions within each game: line → O/U → props
  for (const [gameId, qs] of gameMap) {
    gameMap.set(
      gameId,
      [...qs].sort((a, b) => (TYPE_ORDER[a.question_type] ?? 3) - (TYPE_ORDER[b.question_type] ?? 3))
    )
  }

  // Sort games by earliest start time
  const sortedGames = Array.from(gameMap.entries()).sort(([, aQs], [, bQs]) => {
    const aTime = aQs[0]?.games?.starts_at ?? ''
    const bTime = bQs[0]?.games?.starts_at ?? ''
    return aTime.localeCompare(bTime)
  })

  return (
    <div className="space-y-6">
      {searchBar}
      {sortedGames.map(([gameId, gameQuestions]) => {
        const game = gameQuestions[0]?.games
        return (
          <div key={gameId}>
            {game && (
              <div className="flex items-center gap-3 mb-2 px-1">
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">
                    {game.away_team} <span className="text-gray-600 font-normal">@</span> {game.home_team}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{formatGameTime(game.starts_at)}</p>
                </div>
                <span className="text-xs text-gray-700 font-medium">
                  {gameQuestions.length} {gameQuestions.length === 1 ? 'pick' : 'picks'}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {gameQuestions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  userId={userId}
                  anonPick={anonPicks[q.id] ?? null}
                  onAnonVote={handleAnonVote}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
