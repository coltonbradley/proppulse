import LeaderboardClient from '@/components/LeaderboardClient'
import BottomNav from '@/components/BottomNav'
import HerdLogo from '@/components/HerdLogo'

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <header className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-2">
            <HerdLogo size={30} />
            <span className="text-lg font-bold text-[#D85A30]">HerdPicks</span>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 pb-24">
        <LeaderboardClient />
      </main>

      <BottomNav />
    </div>
  )
}
