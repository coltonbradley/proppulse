import { createClient } from '@/lib/supabase/server'
import LeaderboardTable from '@/components/Leaderboard'
import BottomNav from '@/components/BottomNav'

export default async function LeaderboardPage() {
  const supabase = await createClient()

  const { data: entries } = await supabase
    .from('user_stats')
    .select(`
      user_id,
      accuracy_pct,
      correct_picks,
      total_picks,
      current_streak,
      profiles!inner(username, avatar_url)
    `)
    .gte('total_picks', 5)
    .order('accuracy_pct', { ascending: false })
    .limit(50)

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <header className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-xl mx-auto">
          <span className="text-lg font-bold text-[#D85A30]">PropPulse</span>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 pb-24">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">Top Pickers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Min. 5 picks required to rank</p>
        </div>
        <LeaderboardTable entries={(entries ?? []) as Parameters<typeof LeaderboardTable>[0]['entries']} />
      </main>

      <BottomNav />
    </div>
  )
}
