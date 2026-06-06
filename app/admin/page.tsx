import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import PrizepicksSyncButton from './PrizepicksSyncButton'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function pct(n: number, d: number) {
  return d === 0 ? 0 : Math.round((n / d) * 100)
}

export default async function AdminPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) redirect('/auth/login')

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && user.email !== adminEmail) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <p className="text-gray-400">Not authorized.</p>
      </div>
    )
  }

  const db = serviceClient()
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalPicksAllTime },
    { count: totalPicksToday },
    { count: resolvedAllTime },
    { count: resolvedToday },
    { data: accuracyRaw },
    { data: topPropsRaw },
    { data: recentResolvedRaw },
    { data: failedRaw },
  ] = await Promise.all([
    db.from('picks').select('*', { count: 'exact', head: true }),
    db.from('picks').select('*', { count: 'exact', head: true })
      .gte('picked_at', todayStart.toISOString()),
    db.from('questions').select('*', { count: 'exact', head: true })
      .eq('status', 'resolved'),
    db.from('consensus_results').select('*', { count: 'exact', head: true })
      .gte('resolved_at', todayStart.toISOString()),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).rpc('get_consensus_accuracy'),
    db.from('questions')
      .select('id, question_text, sport, question_type, consensus(vote_count)')
      .eq('status', 'open')
      .gt('closes_at', now.toISOString()),
    db.from('consensus_results')
      .select('question_id, crowd_was_correct, majority_pct, consensus_bracket, sport, prop_type, resolved_at, questions(question_text)')
      .order('resolved_at', { ascending: false })
      .limit(10),
    db.from('questions')
      .select('id, question_text, closes_at, sport, question_type')
      .eq('status', 'closed')
      .is('correct_option', null)
      .lt('closes_at', twoHoursAgo)
      .order('closes_at', { ascending: false })
      .limit(20),
  ])

  type AccuracyRow = { bracket: string; sport: string; total_questions: number; correct: number; accuracy_pct: number }
  const accuracyData = (accuracyRaw ?? []) as AccuracyRow[]

  // Aggregate by bracket (sum across sports)
  const byBracket: Record<string, { total: number; correct: number }> = {}
  for (const row of accuracyData) {
    if (!byBracket[row.bracket]) byBracket[row.bracket] = { total: 0, correct: 0 }
    byBracket[row.bracket].total += row.total_questions
    byBracket[row.bracket].correct += row.correct
  }
  const BRACKET_ORDER = ['50-59%', '60-69%', '70-79%', '80%+']
  const bracketRows = BRACKET_ORDER.filter(b => byBracket[b]).map(b => ({
    bracket: b, ...byBracket[b], accuracy_pct: pct(byBracket[b].correct, byBracket[b].total),
  }))

  // Aggregate by sport (sum across brackets)
  const bySport: Record<string, { total: number; correct: number }> = {}
  for (const row of accuracyData) {
    if (!bySport[row.sport]) bySport[row.sport] = { total: 0, correct: 0 }
    bySport[row.sport].total += row.total_questions
    bySport[row.sport].correct += row.correct
  }
  const sportRows = Object.entries(bySport)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([sport, d]) => ({ sport, ...d, accuracy_pct: pct(d.correct, d.total) }))

  // Top 5 most voted open props
  type OpenQ = { id: string; question_text: string; sport: string; question_type: string; consensus: { vote_count: number }[] }
  const top5Props = ((topPropsRaw ?? []) as unknown as OpenQ[])
    .map(q => ({ ...q, total_votes: q.consensus.reduce((s, c) => s + c.vote_count, 0) }))
    .sort((a, b) => b.total_votes - a.total_votes)
    .slice(0, 5)

  type ResolvedRow = {
    question_id: string
    crowd_was_correct: boolean | null
    majority_pct: number | null
    consensus_bracket: string | null
    sport: string | null
    prop_type: string | null
    resolved_at: string
    questions: { question_text: string } | null
  }
  const recentResolved = (recentResolvedRaw ?? []) as unknown as ResolvedRow[]

  type FailedRow = { id: string; question_text: string; closes_at: string; sport: string; question_type: string }
  const failed = (failedRaw ?? []) as FailedRow[]

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <header className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold text-[#D85A30]">HerdPicks Admin</span>
          <a href="/feed" className="text-sm text-gray-400 hover:text-white">Back to feed</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* ── Summary stats ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Picks', value: (totalPicksAllTime ?? 0).toLocaleString(), sub: `${(totalPicksToday ?? 0).toLocaleString()} today` },
              { label: 'Resolved Questions', value: (resolvedAllTime ?? 0).toLocaleString(), sub: `${(resolvedToday ?? 0).toLocaleString()} today` },
              { label: 'Bracket Rows', value: bracketRows.reduce((s, r) => s + r.total, 0).toLocaleString(), sub: 'consensus_results' },
              { label: 'Failed Resolver', value: failed.length.toString(), sub: 'closed but unresolved 2h+' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                <p className="text-xs text-gray-600 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Consensus accuracy by bracket ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Herd Accuracy by Consensus Bracket</h2>
          {bracketRows.length === 0 ? (
            <p className="text-gray-600 text-sm">No resolved data yet.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Bracket</th>
                    <th className="px-4 py-3 text-right">Questions</th>
                    <th className="px-4 py-3 text-right">Correct</th>
                    <th className="px-4 py-3 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {bracketRows.map(r => (
                    <tr key={r.bracket} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-4 py-3 font-medium">{r.bracket}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{r.total}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{r.correct}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        <span className={r.accuracy_pct >= 55 ? 'text-green-400' : r.accuracy_pct >= 45 ? 'text-gray-300' : 'text-red-400'}>
                          {r.accuracy_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Consensus accuracy by sport ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Herd Accuracy by Sport</h2>
          {sportRows.length === 0 ? (
            <p className="text-gray-600 text-sm">No resolved data yet.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Sport</th>
                    <th className="px-4 py-3 text-right">Questions</th>
                    <th className="px-4 py-3 text-right">Correct</th>
                    <th className="px-4 py-3 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {sportRows.map(r => (
                    <tr key={r.sport} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-4 py-3 font-medium uppercase">{r.sport}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{r.total}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{r.correct}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        <span className={r.accuracy_pct >= 55 ? 'text-green-400' : r.accuracy_pct >= 45 ? 'text-gray-300' : 'text-red-400'}>
                          {r.accuracy_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Top 5 most voted open props ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Top 5 Most Voted Open Props</h2>
          {top5Props.length === 0 ? (
            <p className="text-gray-600 text-sm">No open props.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Question</th>
                    <th className="px-4 py-3 text-left">Sport</th>
                    <th className="px-4 py-3 text-right">Votes</th>
                  </tr>
                </thead>
                <tbody>
                  {top5Props.map(q => (
                    <tr key={q.id} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-4 py-3 text-gray-300 max-w-xs">{q.question_text}</td>
                      <td className="px-4 py-3 text-gray-500 uppercase text-xs">{q.sport}</td>
                      <td className="px-4 py-3 text-right font-semibold">{q.total_votes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Last 10 resolved questions ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Last 10 Resolved Questions</h2>
          {recentResolved.length === 0 ? (
            <p className="text-gray-600 text-sm">No resolved questions recorded yet. Data populates as resolver runs post-migration.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Question</th>
                    <th className="px-4 py-3 text-left">Sport</th>
                    <th className="px-4 py-3 text-right">Consensus</th>
                    <th className="px-4 py-3 text-right">Herd</th>
                    <th className="px-4 py-3 text-right">Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {recentResolved.map(r => (
                    <tr key={r.question_id} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-4 py-3 text-gray-300 max-w-xs text-xs">
                        {(r.questions as { question_text: string } | null)?.question_text ?? r.question_id?.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 uppercase text-xs">{r.sport ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400">{r.majority_pct != null ? `${r.majority_pct}%` : '—'} <span className="text-gray-600">({r.consensus_bracket ?? '—'})</span></td>
                      <td className="px-4 py-3 text-right text-xs font-semibold">
                        {r.crowd_was_correct === null ? '—' : r.crowd_was_correct
                          ? <span className="text-green-400">Correct</span>
                          : <span className="text-red-400">Wrong</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">
                        {new Date(r.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Failed resolutions ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Failed Resolutions
            {failed.length > 0 && <span className="ml-2 text-red-400">({failed.length})</span>}
          </h2>
          {failed.length === 0 ? (
            <p className="text-gray-600 text-sm">None — all closed questions have been resolved.</p>
          ) : (
            <div className="bg-gray-900 border border-red-900/40 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Question</th>
                    <th className="px-4 py-3 text-left">Sport</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-right">Closed At</th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map(q => (
                    <tr key={q.id} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-4 py-3 text-gray-300 max-w-xs text-xs">{q.question_text}</td>
                      <td className="px-4 py-3 text-gray-500 uppercase text-xs">{q.sport}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{q.question_type}</td>
                      <td className="px-4 py-3 text-right text-xs text-red-400">
                        {new Date(q.closes_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── PrizePicks sync ── */}
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
