import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { question_id, option_index } = await request.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated', code: 'UNAUTHENTICATED' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('cast_vote', {
    p_question_id: question_id,
    p_option_index: option_index,
  })

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.code === '23505' ? 409 : 500 }
    )
  }

  return NextResponse.json({ consensus: data })
}
