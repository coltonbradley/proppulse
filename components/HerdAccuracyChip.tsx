// Auto-reveals when consensus_results has ≥100 resolved rows in the 70%+ bracket.
// Renders nothing until that threshold is met.

const THRESHOLD = 100

type Props = {
  total: number
  accuracy: number
}

export default function HerdAccuracyChip({ total, accuracy }: Props) {
  if (total < THRESHOLD) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border border-gray-800 rounded-xl text-sm">
      <span className="text-lg">🐄</span>
      <span className="text-gray-400">
        When 70%+ agree, the herd has been right{' '}
        <span className="font-semibold text-white">{accuracy}%</span> of the time
      </span>
    </div>
  )
}
