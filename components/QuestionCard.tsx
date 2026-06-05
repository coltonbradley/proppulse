'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getStatConfig, STAT_PILL_DEFAULT } from '@/lib/stat-config'

type ConsensusRow = { option_index: number; vote_count: number; pct: number }

type GameInfo = { home_team: string; away_team: string; starts_at: string }

type Question = {
  id: string
  question_text: string
  question_type: string
  stat: string | null
  options: { label: string }[]
  closes_at: string
  status: string
  correct_option: number | null
  consensus: ConsensusRow[]
  userPick: number | null
  games: GameInfo | null
}

type Props = {
  question: Question
  userId: string | null
  anonPick: number | null
  onAnonVote: (questionId: string, optionIndex: number) => void
}

function shortTeam(name: string) {
  return name.trim().split(' ').pop() ?? name
}

function formatGameInfo(game: GameInfo) {
  const d = new Date(game.starts_at)
  const day = d.toLocaleDateString('en-US', { weekday: 'short' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return {
    matchup: `${shortTeam(game.away_team)} @ ${shortTeam(game.home_team)}`,
    time: `${day} · ${time}`,
  }
}

function parsePlayerProp(questionText: string, options: { label: string }[]) {
  const clean = questionText.replace(/^\[MOCK\]\s*/i, '').replace(/\?$/, '')
  const nameAndStat = clean.split(' — over or under ')[0] ?? clean
  const line = options[0]?.label.replace(/^(Over|Under)\s*/i, '').trim() ?? ''

  // Player name = leading capitalized words, stat = first lowercase-starting word onward
  const words = nameAndStat.split(' ')
  let splitIdx = words.length
  for (let i = 1; i < words.length; i++) {
    if (words[i] && /^[a-z]/.test(words[i])) { splitIdx = i; break }
  }

  const playerName = words.slice(0, splitIdx).join(' ')
  const statRaw = words.slice(splitIdx).join(' ')
  const statLabel = statRaw.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  return { playerName, statLabel, line }
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

  const isSharp = hasVoted && localConsensus.some(
    (c) => c.option_index === effectivePick && c.pct >= 70
  )

  const isMatchWinner = question.question_type === 'match_winner'
  const { playerName, statLabel, line } = isMatchWinner
    ? { playerName: '', statLabel: '', line: '' }
    : parsePlayerProp(question.question_text, question.options)
  const gameInfo = question.games ? formatGameInfo(question.games) : null
  const statCfg = getStatConfig(question.stat)
  const pillLabel = isMatchWinner ? 'Winner' : (statCfg?.label ?? (question.stat
    ? question.stat.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Prop'))
  const pillStyle = isMatchWinner
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    : (statCfg?.pill ?? STAT_PILL_DEFAULT)

  // Parse matchup from question_text: "Who wins: France @ Argentina?"
  const matchupMatch = question.question_text.match(/Who wins: (.+) @ (.+)\?/)
  const awayTeam = matchupMatch?.[1] ?? ''
  const homeTeam = matchupMatch?.[2] ?? ''

  function handleVote(optionIndex: number) {
    if (hasVoted || !isOpen || isPending) return
    setError(null)

    if (!userId) {
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
      if (rpcError) { setError(rpcError.message); return }
      setChosenIndex(optionIndex)
      if (data) setLocalConsensus(data as ConsensusRow[])
    })
  }

  const totalVotes = localConsensus.reduce((sum, c) => sum + c.vote_count, 0)
  const correctIndex = question.correct_option

  const consensusSides = isMatchWinner
    ? question.options.map((opt, i) => {
        const row = localConsensus.find((c) => c.option_index === i)
        return { label: opt.label, idx: i, pct: row?.pct ?? 0, count: row?.vote_count ?? 0 }
      })
    : [
        { label: 'More', idx: 0, pct: localConsensus.find((c) => c.option_index === 0)?.pct ?? 0, count: localConsensus.find((c) => c.option_index === 0)?.vote_count ?? 0 },
        { label: 'Less', idx: 1, pct: localConsensus.find((c) => c.option_index === 1)?.pct ?? 0, count: localConsensus.find((c) => c.option_index === 1)?.vote_count ?? 0 },
      ]

  return (
    <div
      id={`q-${question.id}`}
      className="bg-gray-900 border border-gray-800 rounded-2xl p-3 flex flex-col gap-3 transition-shadow duration-300"
    >
      {/* Stat pill + sharp badge */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pillStyle}`}>
          {pillLabel}
        </span>
        {isSharp && (
          <span className="text-[10px] font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
            SHARP
          </span>
        )}
      </div>

      {/* Player / matchup info */}
      {isMatchWinner ? (
        <div className="text-center py-1">
          <p className="text-sm font-bold text-white leading-snug">{awayTeam}</p>
          <p className="text-[10px] text-gray-600 my-0.5 uppercase tracking-widest">vs</p>
          <p className="text-sm font-bold text-white leading-snug">{homeTeam}</p>
          {gameInfo && (
            <p className="text-[11px] text-gray-500 mt-1.5">{gameInfo.time}</p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm font-bold text-white leading-snug">{playerName}</p>
          {gameInfo && (
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              {gameInfo.matchup}<br />{gameInfo.time}
            </p>
          )}
        </div>
      )}

      {/* Hero line (player props only) */}
      {!isMatchWinner && (
        <div className="text-center py-1">
          <p className="text-4xl font-black text-white leading-none tracking-tight">
            {line || '—'}
          </p>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-1.5">
            {statLabel}
          </p>
        </div>
      )}

      {/* Vote buttons or consensus */}
      {!hasVoted && isOpen ? (
        isMatchWinner ? (
          <div className="flex flex-col gap-1.5">
            {question.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleVote(i)}
                disabled={isPending}
                className="w-full py-2 rounded-xl text-xs font-bold
                           bg-gray-800 text-gray-200 border border-gray-700
                           hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40
                           transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
        <div className="flex gap-2">
          <button
            onClick={() => handleVote(0)}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide
                       bg-[#D85A30]/10 text-[#D85A30] border border-[#D85A30]/30
                       hover:bg-[#D85A30] hover:text-white hover:border-[#D85A30]
                       transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            More
          </button>
          <button
            onClick={() => handleVote(1)}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide
                       bg-[#185FA5]/10 text-[#185FA5] border border-[#185FA5]/30
                       hover:bg-[#185FA5] hover:text-white hover:border-[#185FA5]
                       transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Less
          </button>
        </div>
        )
      ) : (
        <div className="space-y-2">
          {consensusSides.map(({ label, idx, pct, count }) => {
            const isChosen = effectivePick === idx
            const isCorrect = correctIndex === idx
            const isWrong = correctIndex !== null && isChosen && !isCorrect
            const barColor = isCorrect
              ? 'bg-green-500'
              : isWrong
              ? 'bg-red-500'
              : isChosen
              ? idx === 0 ? 'bg-[#D85A30]' : 'bg-[#185FA5]'
              : 'bg-gray-700'
            const labelColor = isCorrect
              ? 'text-green-400'
              : isWrong
              ? 'text-red-400'
              : isChosen
              ? idx === 0 ? 'text-[#D85A30]' : 'text-[#185FA5]'
              : 'text-gray-500'

            return (
              <div key={idx}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className={`text-xs font-bold ${labelColor}`}>
                    {label}{isChosen ? ' ✓' : ''}
                  </span>
                  <span className="text-xs font-semibold text-white">{pct}%</span>
                </div>
                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          {totalVotes > 0 && (
            <p className="text-[10px] text-gray-600 text-right mt-0.5">
              {totalVotes.toLocaleString()} votes
            </p>
          )}
        </div>
      )}

      {/* Sign-in nudge after anon vote */}
      {showNudge && !userId && (
        <div className="border-t border-gray-800 pt-2 flex items-center justify-between">
          <p className="text-[10px] text-gray-500">Sign in to track this pick</p>
          <a href="/auth/login" className="text-[10px] font-semibold text-[#D85A30] hover:underline">
            Create account →
          </a>
        </div>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  )
}
