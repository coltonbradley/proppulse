import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LandingProp from './LandingProp'

type ConsensusRow = { option_index: number; vote_count: number; pct: number }
type Question = {
  id: string
  question_text: string
  question_type: string
  options: { label: string }[]
  closes_at: string
  status: string
  correct_option: number | null
  consensus: ConsensusRow[]
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/feed')

  // Pick the most-voted open prop as the featured question
  const { data: raw } = await supabase
    .from('questions')
    .select('id, question_text, question_type, options, closes_at, status, correct_option, consensus(option_index, vote_count, pct)')
    .eq('status', 'open')
    .gt('closes_at', new Date().toISOString())
    .order('closes_at', { ascending: true })
    .limit(30)

  const questions = (raw ?? []) as unknown as Question[]

  if (!questions.length) redirect('/feed')

  // Pick the question with the most total votes (most contested)
  const featured = questions.reduce((best, q) => {
    const votes = q.consensus.reduce((sum, c) => sum + c.vote_count, 0)
    const bestVotes = best.consensus.reduce((sum, c) => sum + c.vote_count, 0)
    return votes > bestVotes ? q : best
  }, questions[0])

  return <LandingProp question={featured} />
}
