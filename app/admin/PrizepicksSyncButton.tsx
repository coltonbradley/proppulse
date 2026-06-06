'use client'

import { useState } from 'react'

type SyncState = 'idle' | 'syncing' | 'done' | 'error'

type Props = { syncKey: string }

export default function PrizepicksSyncButton({ syncKey }: Props) {
  const [state, setState] = useState<SyncState>('idle')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleSync() {
    setState('syncing')
    setMessage('Syncing PrizePicks lines...')
    try {
      const res = await fetch('/api/admin/pp-sync')
      const result = await res.json() as { ok: boolean; synced?: number; error?: string }
      if (!result.ok) throw new Error(result.error ?? 'Unknown error')
      setState('done')
      setMessage(`Synced ${result.synced} PrizePicks lines to cache.`)
    } catch (err) {
      setState('error')
      setMessage(`Server sync failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const SM = JSON.stringify({'Points':'points','Rebounds':'rebounds','Assists':'assists','Steals':'steals','Blocks':'blocks','Goals':'goals','Goalie Saves':'saves','Shots On Goal':'shots on goal','Hits':'hits','Pitcher Strikeouts':'pitcher strikeouts','Runs':'runs','RBIs':'rbis','Home Runs':'home runs','Shots On Target':'shots on target','Shots':'shots','Pts+Rebs+Asts':'Pts+Rebs+Asts','Pts+Rebs':'Pts+Rebs','Pts+Asts':'Pts+Asts','Rebs+Asts':'Rebs+Asts','Hits+Runs+RBIs':'hits+runs+rbis'})
  const LM = JSON.stringify({'NBA':'nba','NFL':'nfl','NHL':'nhl','MLB':'mlb','WORLD CUP':'soccer','WORLD CUP TRNY':'soccer_tournament'})
  const bookmarkletScript = `(async()=>{const SM=${SM},LM=${LM};const r=await fetch('https://api.prizepicks.com/projections?single_stat=true&per_page=1000',{credentials:'include',headers:{'Accept':'application/json'}});const d=await r.json();const pl={};for(const i of d.included??[]){if(i.type==='new_player')pl[i.id]=i.attributes;}const res=new Map();for(const p of d.data??[]){const a=p.attributes;if(a.odds_type!=='standard')continue;const sl=SM[a.stat_type];if(!sl||a.stat_type?.includes('(Combo)'))continue;const pid=p.relationships?.new_player?.data?.id;if(!pid)continue;const pla=pl[pid];if(!pla)continue;const sp=LM[pla.league];if(!sp)continue;const name=pla.display_name??pla.name??'';if(!name||name.includes('+'))continue;const line=a.line_score;if(!line||line<=0)continue;const k=name.toLowerCase()+':'+sl;const ex=res.get(k);if(!ex||line>ex.line)res.set(k,{playerName:name,sport:sp,statLabel:sl,line,ppGameId:p.relationships?.new_game?.data?.id??p.relationships?.game?.data?.id??undefined,gameStartsAt:a.start_time??undefined,playerTeamFull:pla.team_name??undefined});}const lines=Array.from(res.values());const s=await fetch('https://www.getherdpicks.com/api/admin/pp-sync',{method:'POST',headers:{'Content-Type':'application/json','x-sync-key':'${syncKey}'},body:JSON.stringify({lines})});const j=await s.json();alert(j.ok?'Synced '+j.synced+' lines!':'Error: '+j.error);})();`

  async function copyScript() {
    await navigator.clipboard.writeText(bookmarkletScript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const buttonLabel = { idle: 'Sync PrizePicks Lines', syncing: 'Syncing...', done: 'Sync Again', error: 'Retry' }[state]

  return (
    <div className="space-y-5">
      {/* Server-side sync */}
      <div className="space-y-2">
        <button
          onClick={handleSync}
          disabled={state === 'syncing'}
          className="w-full px-4 py-3 rounded-lg font-semibold text-sm bg-[#D85A30] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#c24e28] transition-colors"
        >
          {state === 'syncing' && (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 align-middle" />
          )}
          {buttonLabel}
        </button>
        {message && (
          <p className={`text-sm ${state === 'error' ? 'text-red-400' : state === 'done' ? 'text-green-400' : 'text-gray-400'}`}>
            {message}
          </p>
        )}
      </div>

      {/* Browser bookmarklet fallback */}
      <div className="border border-gray-700 rounded-lg p-4 space-y-3 bg-gray-900/50">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Browser Sync (if server fails)</p>
          <p className="text-xs text-gray-500 mt-1">
            PrizePicks blocks requests from Vercel IPs. If the button above fails, open{' '}
            <a href="https://app.prizepicks.com" target="_blank" rel="noopener noreferrer" className="text-[#D85A30] underline">app.prizepicks.com</a>
            {' '}(must be that exact URL, not www.prizepicks.com), then paste this script in the browser console (F12 → Console tab):
          </p>
        </div>
        <div className="relative">
          <pre className="bg-black rounded p-3 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
            {bookmarkletScript}
          </pre>
          <button
            onClick={copyScript}
            className="absolute top-2 right-2 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}
