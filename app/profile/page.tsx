import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfileStats from '@/components/ProfileStats'
import PicksSection from '@/components/PicksSection'
import BottomNav from '@/components/BottomNav'
import SignOutButton from '@/components/SignOutButton'

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

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const [{ data: rawProfile }, { data: stats }, { data: rawPicks }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_stats').select('*').eq('user_id', user.id).single(),
    supabase
      .from('picks')
      .select(`
        id,
        option_index,
        community_pct_at_vote,
        picked_at,
        result,
        questions!inner(question_text, options, correct_option)
      `)
      .eq('user_id', user.id)
      .not('questions.question_text', 'like', '[MOCK]%')
      .order('picked_at', { ascending: false })
      .limit(50),
  ])

  const profile = rawProfile as { username: string; avatar_url: string | null } | null
  const picks = (rawPicks ?? []) as unknown as PickRow[]

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <header className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold text-[#D85A30]">PropPulse</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{profile?.username}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 pb-24 space-y-6">
        {stats && <ProfileStats stats={stats} />}
        <PicksSection picks={picks} />
      </main>

      <BottomNav />
    </div>
  )
}
