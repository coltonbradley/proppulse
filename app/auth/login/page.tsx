'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setSent(true)
    setLoading(false)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#D85A30]">PropPulse</h1>
          <p className="text-gray-400 mt-1 text-sm">Vote on props. See what the crowd thinks.</p>
        </div>

        {sent ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
            <p className="text-white font-medium">Check your email</p>
            <p className="text-gray-400 text-sm mt-1">We sent a login link to {email}</p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <button
              onClick={handleGoogle}
              className="w-full py-3 rounded-xl bg-white text-gray-900 font-medium text-sm hover:bg-gray-100 transition-colors"
            >
              Continue with Google
            </button>

            <div className="flex items-center gap-3 text-gray-600 text-xs">
              <div className="flex-1 h-px bg-gray-800" />
              or
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            <form onSubmit={handleMagicLink} className="space-y-3">
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm
                           placeholder-gray-500 focus:outline-none focus:border-[#D85A30]"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#D85A30] text-white font-medium text-sm
                           hover:bg-[#c04e27] transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
