import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { InjuryTag } from './InjuryTag'

// The research table both roster surfaces share: sortable columns,
// range-filtered averages, the player column pinned while the numbers
// scroll. Tapping a header sorts descending, tapping again flips.

export interface StatAvg {
  gp: number
  ppg: number
  rpg: number
  apg: number
  spg: number
  bpg: number
  tpg: number
  fgPct: number
}
export interface StatRowPlayer {
  id: string
  name: string
  position: string | null
  teamCode: string | null
  salary: number | null
  injuryStatus?: string | null
}

export type RangeKey = 'season' | 'last30' | 'last10' | 'lastSeason'
export const RANGE_LABELS: Array<[RangeKey, string]> = [
  ['season', 'Season'],
  ['last30', 'Last 30'],
  ['last10', 'Last 10'],
  ['lastSeason', 'Last season'],
]

export function RangeChips({
  value,
  onChange,
  hasLastSeason,
}: {
  value: RangeKey
  onChange: (r: RangeKey) => void
  hasLastSeason: boolean
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {RANGE_LABELS.filter(([k]) => k !== 'lastSeason' || hasLastSeason).map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={
            'text-xs rounded-full px-3 min-h-[2.25rem] border ' +
            (value === k
              ? 'border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
              : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}

type SortKey = keyof StatAvg | 'salary'
const COLS: Array<[SortKey, string]> = [
  ['gp', 'GP'],
  ['ppg', 'PTS'],
  ['rpg', 'REB'],
  ['apg', 'AST'],
  ['spg', 'STL'],
  ['bpg', 'BLK'],
  ['tpg', '3PM'],
  ['fgPct', 'FG%'],
  ['salary', '$'],
]

export function StatTable({
  players,
  stats,
  action,
  defaultSort = 'ppg',
}: {
  players: StatRowPlayer[]
  stats: Record<string, StatAvg>
  action?: (p: StatRowPlayer) => ReactNode
  defaultSort?: SortKey
}) {
  const [sortBy, setSortBy] = useState<SortKey>(defaultSort)
  const [asc, setAsc] = useState(false)

  const valueOf = (p: StatRowPlayer, k: SortKey): number =>
    k === 'salary' ? p.salary ?? 0 : stats[p.id]?.[k] ?? 0

  const sorted = [...players].sort(
    (a, b) => (asc ? 1 : -1) * (valueOf(a, sortBy) - valueOf(b, sortBy))
  )

  const header = (k: SortKey, label: string) => (
    <th key={k} className="p-0">
      <button
        onClick={() => {
          if (sortBy === k) setAsc(!asc)
          else {
            setSortBy(k)
            setAsc(false)
          }
        }}
        aria-pressed={sortBy === k}
        className={
          'w-full min-h-[2.5rem] px-2 text-right text-xs font-bold inline-flex items-center justify-end gap-0.5 ' +
          (sortBy === k ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted-foreground)]')
        }
      >
        {label}
        {sortBy === k ? (
          <ChevronDown aria-hidden className={'w-3 h-3' + (asc ? ' rotate-180' : '')} />
        ) : null}
      </button>
    </th>
  )

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-mns-card">
      <table className="w-full text-sm tabular-nums whitespace-nowrap">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="sticky left-0 bg-mns-card text-left text-xs font-bold text-[var(--color-muted-foreground)] px-3 py-2">
              Player
            </th>
            {COLS.map(([k, label]) => header(k, label))}
            {action ? <th className="p-0" /> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const a = stats[p.id]
            return (
              <tr key={p.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="sticky left-0 bg-mns-card px-3 py-1.5 max-w-[11rem]">
                  <span className="block font-semibold truncate">
                    {p.name}
                    <InjuryTag status={p.injuryStatus} />
                  </span>
                  <span className="block text-xs text-[var(--color-muted-foreground)]">
                    {[p.position, p.teamCode].filter(Boolean).join(' · ')}
                  </span>
                </td>
                <td className="px-2 text-right">{a?.gp ?? 0}</td>
                <td className="px-2 text-right font-semibold">{a?.ppg ?? '—'}</td>
                <td className="px-2 text-right">{a?.rpg ?? '—'}</td>
                <td className="px-2 text-right">{a?.apg ?? '—'}</td>
                <td className="px-2 text-right">{a?.spg ?? '—'}</td>
                <td className="px-2 text-right">{a?.bpg ?? '—'}</td>
                <td className="px-2 text-right">{a?.tpg ?? '—'}</td>
                <td className="px-2 text-right">{a?.fgPct != null ? `${a.fgPct}%` : '—'}</td>
                <td className="px-2 text-right text-[var(--color-muted-foreground)]">
                  {p.salary != null ? `$${(p.salary / 1000).toFixed(0)}k` : '—'}
                </td>
                {action ? <td className="px-2 text-right">{action(p)}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
