import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pickId: string }> }
) {
  const { pickId } = await params
  const supabase = getServiceClient()

  const { data } = await supabase
    .from('picks')
    .select('option_index, community_pct_at_vote, result, profiles(username), questions(question_text, options, correct_option)')
    .eq('id', pickId)
    .single()

  const pick = data as unknown as PickData | null

  if (!pick || pick.result === 'pending') {
    return new Response('Not found', { status: 404 })
  }

  const question = pick.questions
  const chosenLabel = question?.options[pick.option_index]?.label ?? 'Unknown'
  const crowdPct = pick.community_pct_at_vote ?? 50
  const oppPct = 100 - crowdPct
  const isWin = pick.result === 'win'
  const beatCrowd = isWin && crowdPct < 50
  const username = pick.profiles?.username ?? 'Anonymous'

  const questionText = question?.question_text ?? ''
  const truncated = questionText.length > 72 ? questionText.slice(0, 69) + '…' : questionText

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', background: '#D85A30', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '20px', height: '3px', background: 'white', borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '28px', fontWeight: 800, color: '#D85A30' }}>PropPulse</span>
          </div>
          <div
            style={{
              padding: '8px 24px',
              borderRadius: '100px',
              background: isWin ? '#16a34a22' : '#dc262622',
              border: `2px solid ${isWin ? '#16a34a' : '#dc2626'}`,
              fontSize: '20px',
              fontWeight: 800,
              color: isWin ? '#4ade80' : '#f87171',
              letterSpacing: '0.1em',
            }}
          >
            {isWin ? 'WIN' : 'LOSS'}
          </div>
        </div>

        {/* Question */}
        <div style={{ fontSize: '32px', fontWeight: 700, color: 'white', lineHeight: 1.3, marginBottom: '40px' }}>
          {truncated}
        </div>

        {/* Pick + consensus bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '40px' }}>
          {question?.options.map((opt, i) => {
            const isChosen = i === pick.option_index
            const pct = isChosen ? crowdPct : oppPct
            const barColor = isChosen ? (isWin ? '#16a34a' : '#dc2626') : '#374151'

            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '20px', color: isChosen ? 'white' : '#6b7280', fontWeight: isChosen ? 700 : 400 }}>
                    {isChosen ? '▶ ' : ''}{opt.label}
                  </span>
                  <span style={{ fontSize: '20px', color: '#9ca3af' }}>{pct}%</span>
                </div>
                <div style={{ height: '10px', background: '#1f2937', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '999px' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '18px', color: '#6b7280' }}>@{username}</span>
            {beatCrowd && (
              <span style={{ fontSize: '18px', color: '#facc15', fontWeight: 700 }}>Beat the crowd</span>
            )}
          </div>
          <span style={{ fontSize: '18px', color: '#374151' }}>proppulse-lovat.vercel.app</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
