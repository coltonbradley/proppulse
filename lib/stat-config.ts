export type StatConfig = {
  key: string    // DB value e.g. 'points', 'rush yds'
  label: string  // Display label e.g. 'Points', 'Rush Yds'
  pill: string   // Tailwind classes for colored pill
  filter: string // Active filter pill classes
}

export const STAT_CONFIG: StatConfig[] = [
  { key: 'points',        label: 'Points',      pill: 'bg-orange-500/20 text-orange-300 border-orange-500/30',  filter: 'bg-orange-500 text-white'  },
  { key: 'rebounds',      label: 'Rebounds',    pill: 'bg-violet-500/20 text-violet-300 border-violet-500/30',  filter: 'bg-violet-500 text-white'  },
  { key: 'assists',       label: 'Assists',     pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', filter: 'bg-emerald-500 text-white' },
  { key: 'goals',         label: 'Goals',       pill: 'bg-blue-500/20 text-blue-300 border-blue-500/30',        filter: 'bg-blue-500 text-white'    },
  { key: 'shots on goal', label: 'Shots',       pill: 'bg-sky-500/20 text-sky-300 border-sky-500/30',           filter: 'bg-sky-500 text-white'     },
  { key: 'pass tds',      label: 'Pass TDs',    pill: 'bg-red-500/20 text-red-300 border-red-500/30',           filter: 'bg-red-500 text-white'     },
  { key: 'rush yds',      label: 'Rush Yds',    pill: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',  filter: 'bg-yellow-500 text-white'  },
  { key: 'rec yds',       label: 'Rec Yds',     pill: 'bg-amber-500/20 text-amber-300 border-amber-500/30',     filter: 'bg-amber-500 text-white'   },
  { key: 'strikeouts',    label: 'Strikeouts',  pill: 'bg-rose-500/20 text-rose-300 border-rose-500/30',        filter: 'bg-rose-500 text-white'    },
  { key: 'hits',          label: 'Hits',        pill: 'bg-lime-500/20 text-lime-300 border-lime-500/30',         filter: 'bg-lime-500 text-white'    },
  { key: 'total bases',   label: 'Total Bases', pill: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',        filter: 'bg-cyan-500 text-white'    },
]

export const STAT_PILL_DEFAULT = 'bg-gray-700/50 text-gray-400 border-gray-600/30'

export function getStatConfig(key: string | null | undefined): StatConfig | null {
  if (!key) return null
  return STAT_CONFIG.find((s) => s.key === key.toLowerCase()) ?? null
}
