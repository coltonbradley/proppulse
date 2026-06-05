import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import FeedFilter from '@/components/FeedFilter'
import TrendingRail from '@/components/TrendingRail'
import BottomNav from '@/components/BottomNav'
import FeedClient from './FeedClient'

type ConsensusRow = { option_index: number; vote_count: number; pct: number }
type QuestionRow = {
  id: string
  game_id: string
  question_text: string
  question_type: string
  options: { label: string }[]
  closes_at: string
  status: string
  correct_option: number | null
  sport: string
  games: { home_team: string; away_team: string; starts_at: string } | null
  consensus: ConsensusRow[]
}

export type TrendingQuestion = {
  id: string
  question_text: string
  question_type: string
  total_votes: number
}

type Props = {
  searchParams: Promise<{ sport?: string; type?: string }>
}

export default async function FeedPage({ searchParams }: Props) {
  const { sport, type } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Main feed query
  let query = supabase
    .from('questions')
    .select(`
      id,
      game_id,
      question_text,
      question_type,
      options,
      closes_at,
      status,
      correct_option,
      sport,
      games!inner(home_team, away_team, starts_at),
      consensus(option_index, vote_count, pct)
    `)
    .eq('status', 'open')
    .gt('closes_at', new Date().toISOString())
    .order('closes_at', { ascending: true })

  if (sport && sport !== 'all') query = query.eq('sport', sport)
  if (type && type !== 'all') query = query.eq('question_type', type)
  else query = query.in('question_type', ['player_prop', 'match_winner'])

  // Trending: consensus rows updated in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const trendingQuery = supabase
    .from('consensus')
    .select('question_id, vote_count')
    .gt('updated_at', oneHourAgo)

  const [{ data: rawQuestions }, { data: recentConsensus }] = await Promise.all([
    query,
    trendingQuery,
  ])

  const questions = (rawQuestions ?? []) as unknown as QuestionRow[]

  // Aggregate total votes per question from recent consensus activity
  const votesPerQuestion: Record<string, number> = {}
  for (const row of (recentConsensus ?? []) as { question_id: string; vote_count: number }[]) {
    votesPerQuestion[row.question_id] = (votesPerQuestion[row.question_id] ?? 0) + row.vote_count
  }

  // Build trending list: top 5 by recent vote count, open questions only
  const openIds = new Set(questions.map((q) => q.id))
  const trending: TrendingQuestion[] = Object.entries(votesPerQuestion)
    .filter(([id]) => openIds.has(id))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id, total_votes]) => {
      const q = questions.find((q) => q.id === id)!
      return { id, question_text: q.question_text, question_type: q.question_type, total_votes }
    })

  // If fewer than 3 trending, fall back to highest total-voted open questions
  if (trending.length < 3) {
    const byTotal = [...questions]
      .map((q) => ({
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        total_votes: q.consensus.reduce((sum, c) => sum + c.vote_count, 0),
      }))
      .filter((q) => !trending.find((t) => t.id === q.id) && q.total_votes > 0)
      .sort((a, b) => b.total_votes - a.total_votes)
      .slice(0, 5 - trending.length)

    trending.push(...byTotal)
  }

  let userPickMap: Record<string, number> = {}
  if (user && questions.length) {
    const { data: picks } = await supabase
      .from('picks')
      .select('question_id, option_index')
      .eq('user_id', user.id)
      .in('question_id', questions.map((q) => q.id))

    const typedPicks = (picks ?? []) as { question_id: string; option_index: number }[]
    userPickMap = Object.fromEntries(typedPicks.map((p) => [p.question_id, p.option_index]))
  }

  const questionsWithPicks = questions.map((q) => ({
    ...q,
    consensus: q.consensus ?? [],
    userPick: userPickMap[q.id] ?? null,
  }))

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <header className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold text-[#D85A30]">PropPulse</span>
          {!user && (
            <a href="/auth/login" className="text-sm text-[#D85A30] font-medium">Sign in</a>
          )}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-4 pb-24 space-y-4">
        {trending.length > 0 && <TrendingRail items={trending} />}

        <Suspense>
          <FeedFilter />
        </Suspense>

        <FeedClient
          key={`${sport ?? 'all'}-${type ?? 'all'}`}
          initialQuestions={questionsWithPicks}
          userId={user?.id ?? null}
        />
      </main>

      <BottomNav />
    </div>
  )
}
