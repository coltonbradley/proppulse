'use client'

import { useState } from 'react'

type PickRow = {
  id: string
  option_index: number
  community_pct_at_vote: number | null
  picked_at: string
  result: 'pending' | 'win' | 'loss'
  questions: {
    question_text: string
    options: { label: string }[]
    correct_option: number | null
  } | null
}

const resultColor: Record<string, string> = {
  win: 'text-green-400',
  loss: 'text-red-400',
  pending: 'text-gray-400',
}

function PickCard({ pick }: { pick: PickRow }) {
  const withCrowd = pick.community_pct_at_vote != null && pick.community_pct_at_vote >= 50
  const beatCrowd = pick.result === 'win' && !withCrowd
  const fadedCrowd = pick.result === 'win' && withCrowd

  return (
    <div className="bg-gray-900 rounded-xl p-3 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">
          {pick.questions?.question_text.replace(/^\[MOCK\]\s*/i, '')}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {pick.questions?.options[pick.option_index]?.label}
          {pick.community_pct_at_vote != null && (
            <span className="ml-1">· {pick.community_pct_at_vote}% with the Herd</span>
          )}
        </p>
        {pick.result !== 'pending' && (
          <p className={`text-xs mt-1 font-medium ${
            beatCrowd ? 'text-yellow-400' : fadedCrowd ? 'text-gray-500' : 'text-gray-600'
          }`}>
            {beatCrowd ? 'Beat the Herd' : fadedCrowd ? 'Won with the Herd' : withCrowd ? 'Lost with the Herd' : 'Lost vs the Herd'}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-xs font-bold uppercase ${resultColor[pick.result]}`}>
          {pick.result}
        </span>
        {pick.result !== 'pending' && (
          <a
            href={`/share/${pick.id}`}
            className="text-xs text-gray-600 hover:text-[#D85A30] transition-colors"
          >
            Share
          </a>
        )}
      </div>
    </div>
  )
}

type Tab = 'pending' | 'completed'

export default function PicksSection({ picks }: { picks: PickRow[] }) {
  const pendingPicks = picks.filter((p) => p.result === 'pending')
  const completedPicks = picks.filter((p) => p.result !== 'pending')

  const [activeTab, setActiveTab] = useState<Tab>(pendingPicks.length > 0 ? 'pending' : 'completed')

  if (!picks.length) {
    return <p className="text-gray-500 text-sm text-center py-8">No picks yet. Head to the feed!</p>
  }

  const visible = activeTab === 'pending' ? pendingPicks : completedPicks

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors
            ${activeTab === 'pending'
              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
        >
          Pending
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            activeTab === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-500'
          }`}>
            {pendingPicks.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors
            ${activeTab === 'completed'
              ? 'bg-[#D85A30]/20 text-[#D85A30] border border-[#D85A30]/30'
              : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
        >
          Completed
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            activeTab === 'completed' ? 'bg-[#D85A30]/20 text-[#D85A30]' : 'bg-gray-700 text-gray-500'
          }`}>
            {completedPicks.length}
          </span>
        </button>
      </div>

      {/* Pick list */}
      <div className="space-y-2">
        {visible.length > 0
          ? visible.map((pick) => <PickCard key={pick.id} pick={pick} />)
          : (
            <p className="text-gray-500 text-sm text-center py-8">
              {activeTab === 'pending' ? 'No pending picks.' : 'No completed picks yet.'}
            </p>
          )}
      </div>
    </div>
  )
}
