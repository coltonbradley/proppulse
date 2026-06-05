'use client'

import { useState, useTransition } from 'react'
import ConsensusBar from './ConsensusBar'
import { createClient } from '@/lib/supabase/client'

type ConsensusRow = {
  option_index: number
  vote_count: number
  pct: number
}

type Question = {
  id: string
  question_text: string
  question_type: string
  options: { label: string }[]
  closes_at: string
  status: string
  correct_option: number | null
  consensus: ConsensusRow[]
  userPick: number | null
}

type Props = {
  question: Question
  userId: string | null
  anonPick: number | null
  onAnonVote: (questionId: string, optionIndex: number) => void
}

export default function QuestionCard({ question, userId, anonPick, onAnonVote }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [localConsensus, setLocalConsensus] = useState<ConsensusRow[]>(question.consensus)
  const [chosenIndex, setChosenIndex] = useState<number | null>(question.userPick)
  const [showNudge, setShowNudge] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectivePick = chosenIndex ?? anonPick
  const hasVoted = effectivePick !== null
  const isOpen = question.status === 'open' && new Date(question.closes_at) > new Date()

  const isSharp =
    hasVoted &&
    localConsensus.some((c) => c.option_index === effectivePick && c.pct >= 70)

  function handleVote(optionIndex: number) {
    if (hasVoted || !isOpen || isPending) return
    setError(null)

    if (!userId) {
      // Anonymous vote — update consensus in DB + save locally
      startTransition(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).rpc('cast_anon_vote', {
          p_question_id: question.id,
          p_option_index: optionIndex,
        })
        if (data) setLocalConsensus(data as ConsensusRow[])
        onAnonVote(question.id, optionIndex)
        setShowNudge(true)
      })
      return
    }

    startTransition(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase as any).rpc('cast_vote', {
        p_question_id: question.id,
        p_option_index: optionIndex,
      })

      if (rpcError) {
        setError(rpcError.message)
        return
      }

      setChosenIndex(optionIndex)
      if (data) setLocalConsensus(data as ConsensusRow[])
    })
  }

  const consensusOptions = question.options.map((opt, i) => {
    const row = localConsensus.find((c) => c.option_index === i)
    return {
      label: opt.label,
      pct: row?.pct ?? 0,
      voteCount: row?.vote_count ?? 0,
    }
  })

  const typeLabel: Record<string, string> = {
    player_prop: 'PROP',
    game_line: 'LINE',
    over_under: 'O/U',
    match_winner: 'WINNER',
  }

  return (
    <div id={`q-${question.id}`} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3 transition-shadow duration-300">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-[#D85A30] bg-[#D85A30]/10 px-2 py-0.5 rounded-full">
          {typeLabel[question.question_type] ?? question.question_type}
        </span>
        {isSharp && (
          <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
            SHARP
          </span>
        )}
      </div>

      <p className="font-semibold text-white leading-snug">{question.question_text}</p>

      {!hasVoted && isOpen ? (
        <div className="flex gap-2">
          {question.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleVote(i)}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm font-medium
                         hover:border-[#D85A30] hover:text-[#D85A30] hover:bg-[#D85A30]/5
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <ConsensusBar
          options={consensusOptions}
          chosenIndex={effectivePick}
          correctIndex={question.correct_option}
        />
      )}

      {/* Sign-in nudge after anon vote */}
      {showNudge && !userId && (
        <div className="border-t border-gray-800 pt-3 flex items-center justify-between">
          <p className="text-xs text-gray-500">Sign in to track this pick</p>
          <a
            href="/auth/login"
            className="text-xs font-semibold text-[#D85A30] hover:underline"
          >
            Create account →
          </a>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
