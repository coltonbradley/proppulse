import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import FeedFilter from '@/components/FeedFilter'
import TrendingRail from '@/components/TrendingRail'
import BottomNav from '@/components/BottomNav'
import FeedClient from './FeedClient'
import HerdAccuracyChip from '@/components/HerdAccuracyChip'
import HerdLogo from '@/components/HerdLogo'

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
  stat: string | null
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
  searchParams: Promise<{ sport?: string; type?: string; stat?: string }>
}

export default async function FeedPage({ searchParams }: Props) {
  const { sport, type, stat } = await searchParams
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
      stat,
      games!inner(home_team, away_team, starts_at),
      consensus(option_index, vote_count, pct)
    `)
    .eq('status', 'open')
    .gt('closes_at', new Date().toISOString())
    .not('question_text', 'like', '[MOCK]%')
    .order('closes_at', { ascending: true })

  if (sport && sport !== 'all') query = query.eq('sport', sport)
  if (type && type !== 'all') query = query.eq('question_type', type)
  else query = query.in('question_type', ['player_prop', 'match_winner'])
  if (stat && stat !== 'all') query = query.or(`stat.eq.${stat},question_type.eq.match_winner`)

  // Trending: RPC computes recent vote velocity × consensus lopsidedness
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trendingQuery = (supabase as any).rpc('get_trending_questions', { p_limit: 10 })

  // Available stat categories — only meaningful when a specific sport is selected
  let statsQuery = supabase
    .from('questions')
    .select('stat')
    .eq('status', 'open')
    .eq('question_type', 'player_prop')
    .gt('closes_at', new Date().toISOString())
    .not('stat', 'is', null)
  if (sport && sport !== 'all') statsQuery = statsQuery.eq('sport', sport)

  // Herd accuracy chip — auto-reveals at 100 resolved rows in the 70%+ bracket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const herdQuery = (supabase as any).rpc('get_herd_accuracy', { p_min_pct: 70 })

  const [{ data: rawQuestions }, { data: recentConsensus }, { data: statRows }, { data: herdRaw }] = await Promise.all([
    query,
    trendingQuery,
    statsQuery,
    herdQuery,
  ])

  const availableStats = [...new Set(
    (statRows ?? []).map((r: { stat: string | null }) => r.stat).filter(Boolean)
  )] as string[]

  type HerdRow = { total: number; correct: number; accuracy_pct: number }
  const herdRow = ((herdRaw ?? []) as HerdRow[])[0] ?? { total: 0, accuracy_pct: 0 }

  const questions = (rawQuestions ?? []) as unknown as QuestionRow[]

  // Build trending from RPC: trend_score = recent_votes × abs(dominant_pct − 50) / 100
  type TrendingRow = { question_id: string; recent_votes: number; trend_score: number }
  const openIds = new Set(questions.map((q) => q.id))
  const trending: TrendingQuestion[] = ((recentConsensus ?? []) as TrendingRow[])
    .filter((row) => openIds.has(row.question_id))
    .map((row) => {
      const q = questions.find((q) => q.id === row.question_id)!
      return {
        id: row.question_id,
        question_text: q.question_text,
        question_type: q.question_type,
        total_votes: row.recent_votes,
      }
    })

  // Fallback: if fewer than 5 from velocity scoring, fill with highest all-time voted questions
  if (trending.length < 5) {
    const byTotal = [...questions]
      .map((q) => ({
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        total_votes: q.consensus.reduce((sum, c) => sum + c.vote_count, 0),
      }))
      .filter((q) => !trending.find((t) => t.id === q.id) && q.total_votes > 0)
      .sort((a, b) => b.total_votes - a.total_votes)
      .slice(0, 10 - trending.length)

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
          <div className="flex items-center gap-2">
            <HerdLogo size={30} />
            <span className="text-lg font-bold text-[#D85A30]">HerdPicks</span>
          </div>
          {!user && (
            <a href="/auth/login" className="text-sm text-[#D85A30] font-medium">Sign in</a>
          )}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-4 pb-24 space-y-4">
        {trending.length > 0 && <TrendingRail items={trending} />}

        <Suspense>
          <FeedFilter availableStats={availableStats} />
        </Suspense>

        <HerdAccuracyChip total={herdRow.total} accuracy={herdRow.accuracy_pct} />

        <FeedClient
          key={`${sport ?? 'all'}-${type ?? 'all'}-${stat ?? 'all'}`}
          initialQuestions={questionsWithPicks}
          userId={user?.id ?? null}
        />
      </main>

      <BottomNav />
    </div>
  )
}
