'use client'

type ConsensusOption = {
  label: string
  pct: number
  voteCount: number
}

type Props = {
  options: ConsensusOption[]
  chosenIndex: number | null
  correctIndex: number | null
}

export default function ConsensusBar({ options, chosenIndex, correctIndex }: Props) {
  return (
    <div className="space-y-2 mt-3">
      {options.map((opt, i) => {
        const isChosen = chosenIndex === i
        const isCorrect = correctIndex === i
        const isWrong = correctIndex !== null && isChosen && !isCorrect

        const barColor = isCorrect
          ? 'bg-green-500'
          : isWrong
          ? 'bg-red-500'
          : isChosen
          ? 'bg-[#D85A30]'
          : 'bg-[#185FA5]'

        return (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1">
              <span className={isChosen ? 'font-semibold text-[#D85A30]' : 'text-gray-300'}>
                {opt.label}
              </span>
              <span className="text-gray-400 text-xs">
                {opt.pct}% · {opt.voteCount.toLocaleString()} votes
              </span>
            </div>
            <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                style={{ width: `${opt.pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
