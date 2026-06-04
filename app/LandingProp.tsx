'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ConsensusBar from '@/components/ConsensusBar'

const ANON_PICKS_KEY = 'proppulse_anon_picks'

type ConsensusRow = { option_index: number; vote_count: number; pct: number }
type Question = {
  id: string
  question_text: string
  question_type: string
  options: { label: string }[]
  closes_at: string
  status: string
  correct_option: number | null
  consensus: ConsensusRow[]
}

export default function LandingProp({ question }: { question: Question }) {
  const supabase = createClient()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [voted, setVoted] = useState(false)
  const [chosenIndex, setChosenIndex] = useState<number | null>(null)
  const [consensus, setConsensus] = useState<ConsensusRow[]>(question.consensus)

  const totalVotes = consensus.reduce((sum, c) => sum + c.vote_count, 0)
  const beatCrowd =
    voted &&
    chosenIndex !== null &&
    (consensus.find((c) => c.option_index === chosenIndex)?.pct ?? 0) < 50

  function handleVote(optionIndex: number) {
    if (voted || isPending) return

    startTransition(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc('cast_anon_vote', {
        p_question_id: question.id,
        p_option_index: optionIndex,
      })

      // Save to localStorage so FeedClient can replay on sign-in
      try {
        const existing = JSON.parse(localStorage.getItem(ANON_PICKS_KEY) ?? '{}')
        existing[question.id] = optionIndex
        localStorage.setItem(ANON_PICKS_KEY, JSON.stringify(existing))
      } catch { /* ignore */ }

      setChosenIndex(optionIndex)
      if (data) setConsensus(data as ConsensusRow[])
      setVoted(true)
    })
  }

  const consensusOptions = question.options.map((opt, i) => {
    const row = consensus.find((c) => c.option_index === i)
    return { label: opt.label, pct: row?.pct ?? 0, voteCount: row?.vote_count ?? 0 }
  })

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">

        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-[#D85A30]">PropPulse</h1>
          <p className="text-sm text-gray-500">Vote on props. See what the crowd thinks.</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">

          {/* Type badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#D85A30] bg-[#D85A30]/10 px-2 py-0.5 rounded-full">
              {{ player_prop: 'PROP', game_line: 'LINE', over_under: 'O/U' }[question.question_type] ?? 'PROP'}
            </span>
            {totalVotes > 0 && (
              <span className="text-xs text-gray-600">
                {totalVotes.toLocaleString()} votes
              </span>
            )}
          </div>

          {/* Question */}
          <p className="text-xl font-bold text-white leading-snug">
            {question.question_text}
          </p>

          {/* Vote buttons or consensus */}
          {!voted ? (
            <div className="flex flex-col gap-3">
              {question.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleVote(i)}
                  disabled={isPending}
                  className="w-full py-4 rounded-xl border border-gray-700 text-base font-semibold
                             hover:border-[#D85A30] hover:text-[#D85A30] hover:bg-[#D85A30]/5
                             transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <ConsensusBar
                options={consensusOptions}
                chosenIndex={chosenIndex}
                correctIndex={question.correct_option}
              />
              {beatCrowd && (
                <p className="text-yellow-400 text-sm font-bold">
                  Contrarian pick — you went against the crowd
                </p>
              )}
            </div>
          )}
        </div>

        {/* CTAs */}
        {voted ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push('/feed')}
              className="w-full py-3.5 rounded-xl bg-[#D85A30] text-white font-semibold text-base
                         hover:bg-[#c04e27] transition-colors"
            >
              See all tonight&apos;s props →
            </button>
            <a
              href="/auth/login"
              className="w-full py-3 rounded-xl border border-gray-700 text-gray-400 font-medium
                         text-sm text-center hover:border-gray-600 hover:text-white transition-colors"
            >
              Sign in to track your picks
            </a>
          </div>
        ) : (
          <button
            onClick={() => router.push('/feed')}
            className="w-full text-center text-sm text-gray-600 hover:text-gray-400 transition-colors"
          >
            Skip to full feed →
          </button>
        )}
      </div>
    </div>
  )
}
