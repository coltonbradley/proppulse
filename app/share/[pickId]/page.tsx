import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import ShareButtons from './ShareButtons'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Props = { params: Promise<{ pickId: string }> }

export async function generateMetadata({ params }: Props) {
  const { pickId } = await params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://proppulse-lovat.vercel.app'
  const imageUrl = `${appUrl}/api/share/${pickId}`

  return {
    title: 'PropPulse — Pick Result',
    openGraph: {
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [imageUrl],
    },
  }
}

export default async function SharePage({ params }: Props) {
  const { pickId } = await params
  const supabase = getServiceClient()

  const { data } = await supabase
    .from('picks')
    .select('option_index, community_pct_at_vote, result, profiles(username), questions(question_text, options, correct_option)')
    .eq('id', pickId)
    .single()

  type PickData = {
    option_index: number
    community_pct_at_vote: number | null
    result: 'win' | 'loss' | 'pending'
    profiles: { username: string } | null
    questions: {
      question_text: string
      options: { label: string }[]
      correct_option: number | null
    } | null
  }

  const pick = data as unknown as PickData | null

  if (!pick || pick.result === 'pending') notFound()

  const chosenLabel = pick.questions?.options[pick.option_index]?.label ?? 'Unknown'
  const crowdPct = pick.community_pct_at_vote ?? 50
  const oppPct = 100 - crowdPct
  const isWin = pick.result === 'win'
  const beatCrowd = isWin && crowdPct < 50
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://proppulse-lovat.vercel.app'
  const shareUrl = `${appUrl}/share/${pickId}`

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center px-4 py-12">
      <a href="/feed" className="text-[#D85A30] font-bold text-xl mb-8">PropPulse</a>

      {/* Card */}
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            {pick.profiles?.username ?? 'Anonymous'}
          </span>
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${isWin ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {isWin ? 'WIN' : 'LOSS'}
          </span>
        </div>

        <p className="text-white font-semibold text-lg leading-snug">
          {pick.questions?.question_text}
        </p>

        <div className="space-y-3">
          {pick.questions?.options.map((opt, i) => {
            const isChosen = i === pick.option_index
            const pct = isChosen ? crowdPct : oppPct
            const barColor = isChosen
              ? isWin ? 'bg-green-500' : 'bg-red-500'
              : 'bg-gray-700'

            return (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={isChosen ? 'font-bold text-white' : 'text-gray-500'}>
                    {isChosen ? '▶ ' : ''}{opt.label}
                  </span>
                  <span className="text-gray-500">{pct}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        {beatCrowd && (
          <p className="text-yellow-400 font-bold text-sm">Beat the crowd</p>
        )}
      </div>

      <ShareButtons shareUrl={shareUrl} result={pick.result} chosenLabel={chosenLabel} />

      <a href="/feed" className="mt-6 text-sm text-[#D85A30] hover:underline">
        Vote on tonight&apos;s props →
      </a>
    </div>
  )
}
