import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const results: Record<string, unknown> = {}

  // 1. Delete alt/milestone props
  const { data: altDeleted } = await supabase
    .from('questions')
    .delete()
    .or('stat.ilike.%alt%,stat.ilike.%milestone%')
    .select('id')
  results.alt_milestone = altDeleted?.length ?? 0

  // 2. Delete zero-line props ("over or under 0")
  const { data: zeroDeleted } = await supabase
    .from('questions')
    .delete()
    .like('question_text', '%over or under 0%')
    .select('id')
  results.zero_line = zeroDeleted?.length ?? 0

  // 3. Delete template placeholder props ({optionTypeAbbr}...)
  const { data: templateDeleted } = await supabase
    .from('questions')
    .delete()
    .like('question_text', '{%')
    .select('id')
  results.template_placeholders = templateDeleted?.length ?? 0

  // 4. Delete game total props seeded as player props ("Total points...")
  const { data: totalDeleted } = await supabase
    .from('questions')
    .delete()
    .ilike('question_text', 'total %')
    .eq('question_type', 'player_prop')
    .select('id')
  results.game_totals = totalDeleted?.length ?? 0

  // 5. Delete team-matchup player names ("New York Knicks vs San Antonio Spurs points...")
  const { data: matchupDeleted } = await supabase
    .from('questions')
    .delete()
    .like('question_text', '% vs %')
    .eq('question_type', 'player_prop')
    .select('id')
  results.team_matchups = matchupDeleted?.length ?? 0

  // 6. Remove logically impossible player prop lines:
  //    A player's points line can never exceed their pts+rebs+asts line.
  //    If it does, the points line is a data error (e.g. total points seeded as player prop).
  const { data: ptsProps } = await supabase
    .from('questions')
    .select('id, game_id, question_text, options')
    .eq('question_type', 'player_prop')
    .eq('status', 'open')
    .eq('stat', 'points')
  const { data: comboProps } = await supabase
    .from('questions')
    .select('id, game_id, question_text, options')
    .eq('question_type', 'player_prop')
    .eq('status', 'open')
    .eq('stat', 'pts rebs asts')

  // Build map: game_id:playerName → pts+rebs+asts line
  const comboLineMap = new Map<string, number>()
  for (const cp of (comboProps ?? []) as { id: string; game_id: string; question_text: string; options: {label:string}[] }[]) {
    const text = (cp.question_text ?? '').split(' — ')[0]
    const words = text.split(' ')
    let splitIdx = words.length
    for (let i = 1; i < words.length; i++) {
      if (words[i] && /^[a-z\d]/.test(words[i])) { splitIdx = i; break }
    }
    const playerName = words.slice(0, splitIdx).join(' ')
    const lineLabel = (cp.options as {label:string}[])[0]?.label ?? ''
    const lineNum = parseFloat(lineLabel.replace(/[^0-9.]/g, ''))
    if (!isNaN(lineNum)) comboLineMap.set(`${cp.game_id}:${playerName}`, lineNum)
  }

  const impossiblePtsIds: string[] = []
  for (const pp of (ptsProps ?? []) as { id: string; game_id: string; question_text: string; options: {label:string}[] }[]) {
    const text = (pp.question_text ?? '').split(' — ')[0]
    const words = text.split(' ')
    let splitIdx = words.length
    for (let i = 1; i < words.length; i++) {
      if (words[i] && /^[a-z\d]/.test(words[i])) { splitIdx = i; break }
    }
    const playerName = words.slice(0, splitIdx).join(' ')
    const lineLabel = (pp.options as {label:string}[])[0]?.label ?? ''
    const ptsLine = parseFloat(lineLabel.replace(/[^0-9.]/g, ''))
    const comboLine = comboLineMap.get(`${pp.game_id}:${playerName}`)
    if (comboLine !== undefined && !isNaN(ptsLine) && ptsLine > comboLine) {
      impossiblePtsIds.push(pp.id)
    }
  }
  if (impossiblePtsIds.length) {
    const { data: impDeleted } = await supabase
      .from('questions').delete().in('id', impossiblePtsIds).select('id')
    results.impossible_pts_lines = impDeleted?.length ?? 0
  } else {
    results.impossible_pts_lines = 0
  }

  // 7. Delete all player props whose stat is not a PrizePicks-sourced value.
  // This removes everything seeded from ParlayAPI, old Odds API paths, or legacy formats
  // like "pts asts" (space-separated) that predated the "Pts+Asts" format.
  const PP_VALID_STATS = [
    // NBA
    'points', 'rebounds', 'assists', 'steals', 'blocks',
    'Pts+Rebs+Asts', 'Pts+Rebs', 'Pts+Asts', 'Rebs+Asts',
    // NHL
    'goals', 'saves', 'shots on goal',
    // MLB
    'hits', 'pitcher strikeouts', 'hits+runs+rbis', 'runs', 'rbis', 'home runs',
    // Soccer
    'shots on target', 'shots',
  ]
  const { data: allOpenProps } = await supabase
    .from('questions')
    .select('id, stat')
    .eq('question_type', 'player_prop')
    .eq('status', 'open')
  const nonPpIds = (allOpenProps ?? [])
    .filter((q: { id: string; stat: string | null }) => !q.stat || !PP_VALID_STATS.includes(q.stat))
    .map((q: { id: string }) => q.id)
  if (nonPpIds.length) {
    const { data: nonPpDeleted } = await supabase
      .from('questions').delete().in('id', nonPpIds).select('id')
    results.non_pp_props = nonPpDeleted?.length ?? 0
  } else {
    results.non_pp_props = 0
  }

  // 8. Remove duplicate player lines (same game/stat/player, keep only first created)
  const { data: allPlayerProps } = await supabase
    .from('questions')
    .select('id, game_id, stat, question_text, created_at')
    .eq('question_type', 'player_prop')
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  const seenPlayerStat = new Map<string, string>()
  const dupPropIds: string[] = []
  for (const q of (allPlayerProps ?? []) as { id: string; game_id: string; stat: string | null; question_text: string; created_at: string }[]) {
    const cleanText = (q.question_text ?? '').replace(/\?$/, '').split(' — ')[0]
    const words = cleanText.split(' ')
    let splitIdx = words.length
    for (let i = 1; i < words.length; i++) {
      if (words[i] && /^[a-z\d]/.test(words[i])) { splitIdx = i; break }
    }
    const playerName = words.slice(0, splitIdx).join(' ')
    const key = `${q.game_id}:${q.stat}:${playerName}`
    if (seenPlayerStat.has(key)) {
      dupPropIds.push(q.id)
    } else {
      seenPlayerStat.set(key, q.id)
    }
  }
  if (dupPropIds.length) {
    const { data: dupDeleted } = await supabase
      .from('questions').delete().in('id', dupPropIds).select('id')
    results.dup_prop_lines = dupDeleted?.length ?? 0
  } else {
    results.dup_prop_lines = 0
  }

  // 9. Remove duplicate games using fuzzy team name matching.
  // PrizePicks uses abbreviated names ("Golden Knights") while The Odds API uses full names
  // ("Vegas Golden Knights"), so exact-name dedup alone misses these pairs.
  const lastWord = (s: string) => s.toLowerCase().trim().split(' ').pop() ?? ''
  const fuzzyTeamsMatch = (a: string, b: string) => {
    if (a.toLowerCase().trim() === b.toLowerCase().trim()) return true
    const la = lastWord(a), lb = lastWord(b)
    return la.length > 2 && la === lb
  }

  const { data: allGames } = await supabase
    .from('games')
    .select('id, sport, home_team, away_team, starts_at, created_at')
    .in('sport', ['nba', 'nfl', 'mlb', 'nhl', 'soccer'])
    .order('created_at', { ascending: true })  // oldest first → keep oldest

  // Group by sport+date, then within each group find fuzzy duplicates
  const byGroup = new Map<string, { id: string; home: string; away: string }[]>()
  for (const g of (allGames ?? []) as { id: string; sport: string; home_team: string; away_team: string; starts_at: string }[]) {
    const gk = `${g.sport}|${g.starts_at.slice(0, 10)}`
    if (!byGroup.has(gk)) byGroup.set(gk, [])
    byGroup.get(gk)!.push({ id: g.id, home: g.home_team, away: g.away_team })
  }

  const dupIds: string[] = []
  for (const group of byGroup.values()) {
    const kept: { id: string; home: string; away: string }[] = []
    for (const g of group) {
      const isDup = kept.some(
        (k) => fuzzyTeamsMatch(k.home, g.home) && fuzzyTeamsMatch(k.away, g.away)
      )
      if (isDup) {
        dupIds.push(g.id)
      } else {
        kept.push(g)
      }
    }
  }

  if (dupIds.length) {
    // Delete questions tied to duplicate games first
    const { data: qDeleted } = await supabase
      .from('questions')
      .delete()
      .in('game_id', dupIds)
      .select('id')
    results.dup_questions = qDeleted?.length ?? 0

    const { data: gDeleted } = await supabase
      .from('games')
      .delete()
      .in('id', dupIds)
      .select('id')
    results.dup_games = gDeleted?.length ?? 0
  } else {
    results.dup_games = 0
    results.dup_questions = 0
  }

  return NextResponse.json({ ok: true, deleted: results })
}
