import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfileStats from '@/components/ProfileStats'
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
        questions(question_text, options, correct_option)
      `)
      .eq('user_id', user.id)
      .order('picked_at', { ascending: false })
      .limit(20),
  ])

  const profile = rawProfile as { username: string; avatar_url: string | null } | null
  const picks = (rawPicks ?? []) as unknown as PickRow[]

  const resultColor: Record<string, string> = {
    win: 'text-green-400',
    loss: 'text-red-400',
    pending: 'text-gray-400',
  }

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

        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Recent Picks
          </h2>
          <div className="space-y-2">
            {picks.map((pick) => {
              const withCrowd = pick.community_pct_at_vote != null && pick.community_pct_at_vote >= 50
              const beatCrowd = pick.result === 'win' && !withCrowd
              const fadedCrowd = pick.result === 'win' && withCrowd

              return (
              <div key={pick.id} className="bg-gray-900 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{pick.questions?.question_text}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pick.questions?.options[pick.option_index]?.label}
                    {pick.community_pct_at_vote != null && (
                      <span className="ml-1">· {pick.community_pct_at_vote}% with crowd</span>
                    )}
                  </p>
                  {pick.result !== 'pending' && (
                    <p className={`text-xs mt-1 font-medium ${beatCrowd ? 'text-yellow-400' : fadedCrowd ? 'text-gray-500' : 'text-gray-600'}`}>
                      {beatCrowd ? 'Beat the crowd' : fadedCrowd ? 'Won with crowd' : withCrowd ? 'Lost with crowd' : 'Lost vs crowd'}
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
            )})}
            {!picks.length && (
              <p className="text-gray-500 text-sm text-center py-8">No picks yet. Head to the feed!</p>
            )}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
