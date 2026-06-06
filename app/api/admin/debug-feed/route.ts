import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Grab a sample of open player props to inspect question_text patterns
  const { data: props } = await supabase
    .from('questions')
    .select('question_text, stat, options, sport, closes_at, game_id')
    .eq('question_type', 'player_prop')
    .eq('status', 'open')
    .or('question_text.ilike.%vs%,question_text.ilike.%{%,question_text.ilike.%Total%,question_text.ilike.%Alvarado%')
    .limit(30)

  // Also check what the raw player name looks like for these
  const parsed = (props ?? []).map((p) => {
    const text = p.question_text as string
    const options = p.options as { label: string }[]
    const line = options[0]?.label ?? ''
    return { text, stat: p.stat, line, sport: p.sport, closes_at: p.closes_at, game_id: p.game_id }
  })

  return NextResponse.json(parsed)
}
