import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrizepicksSyncButton from './PrizepicksSyncButton'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && user.email !== adminEmail) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <p className="text-gray-400">Not authorized.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <header className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold text-[#D85A30]">PropPulse Admin</span>
          <a href="/feed" className="text-sm text-gray-400 hover:text-white">Back to feed</a>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-[#1a1a1a] rounded-xl p-5 border border-gray-800 space-y-4">
          <div>
            <h2 className="text-base font-semibold">PrizePicks Line Sync</h2>
            <p className="text-sm text-gray-400 mt-1">
              Fetches the current standard-tier PrizePicks board from your browser
              (bypassing server-side Cloudflare blocks) and caches the lines in Supabase.
              Run this before seeding props so the seeder uses accurate PrizePicks lines.
            </p>
          </div>
          <PrizepicksSyncButton />
        </section>
      </main>
    </div>
  )
}
