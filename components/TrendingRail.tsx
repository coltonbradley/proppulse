'use client'

import type { TrendingQuestion } from '@/app/feed/page'

const TYPE_LABEL: Record<string, string> = {
  player_prop: 'PROP',
  game_line: 'LINE',
  over_under: 'O/U',
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

export default function TrendingRail({ items }: { items: TrendingQuestion[] }) {
  function scrollToQuestion(id: string) {
    const el = document.getElementById(`q-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-[#D85A30]', 'ring-offset-2', 'ring-offset-[#0f0f0f]')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[#D85A30]', 'ring-offset-2', 'ring-offset-[#0f0f0f]')
      }, 1800)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <span className="text-sm font-bold text-white">Hot right now</span>
        <span className="text-base leading-none">🔥</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToQuestion(item.id)}
            className="shrink-0 w-44 bg-gray-900 border border-gray-800 rounded-xl p-3 text-left
                       hover:border-[#D85A30]/50 transition-colors active:scale-95"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#D85A30]">
                {TYPE_LABEL[item.question_type] ?? 'PROP'}
              </span>
              <span className="text-xs text-gray-600">
                {item.total_votes.toLocaleString()} votes
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-snug">
              {truncate(item.question_text, 60)}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
