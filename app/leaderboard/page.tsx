import LeaderboardClient from '@/components/LeaderboardClient'
import BottomNav from '@/components/BottomNav'

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <header className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-xl mx-auto">
          <span className="text-lg font-bold text-[#D85A30]">HerdPicks</span>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 pb-24">
        <LeaderboardClient />
      </main>

      <BottomNav />
    </div>
  )
}
