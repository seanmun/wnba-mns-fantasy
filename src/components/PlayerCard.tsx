import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi'
import { Sheet, Chip, Skeleton } from '../ui/components'
import { PlayerName } from './InjuryTag'
import { RANGE_LABELS, type StatAvg } from './StatTable'

// The player card: who they are, what they've done, and the news —
// one tap from any roster row. Details and the game log come from the
// player endpoint; the range averages arrive from the page that
// already holds them.

interface CardPlayer {
  id: string
  name: string
  position: string | null
  teamCode: string | null
  salary: number | null
  isRookie: boolean
  teamName: string | null
  injuryStatus: string | null
  injuryNote: string | null
  injuryUpdatedAt: string | null
}
interface LogLine {
  date: string
  min: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tpm: number
  fgm: number
  fga: number
  tov: number
}

// "New news" = the report changed inside the last 48 hours.
export const isFreshNews = (updatedAt?: string | null, status?: string | null) =>
  !!status && !!updatedAt && Date.now() - new Date(updatedAt).getTime() < 48 * 3600 * 1000

const fmtSalary = (n: number | null) =>
  n != null ? (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`) : null
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function PlayerCard({
  leagueId,
  playerId,
  ranges,
  onClose,
}: {
  leagueId: string
  playerId: string | null
  ranges: Record<string, Record<string, StatAvg> | null> | null
  onClose: () => void
}) {
  const { apiFetch } = useApi()
  const [data, setData] = useState<{ player: CardPlayer; log: LogLine[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    if (!playerId) return
    let cancelled = false
    apiFetch<{ player: CardPlayer; log: LogLine[] }>(
      `/api/leagues/${leagueId}/players/${playerId}`
    )
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId, playerId])

  return (
    <Sheet compact open={!!playerId} onClose={onClose} label="Player card">
      {/* The card stays hand-sized; anything past that scrolls inside. */}
      <div className="max-h-[65vh] overflow-y-auto overscroll-contain px-4">
        <PlayerCardInner playerId={playerId} ranges={ranges} data={data} error={error} />
      </div>
    </Sheet>
  )
}

function PlayerCardInner({
  playerId,
  ranges,
  data,
  error,
}: {
  playerId: string | null
  ranges: Record<string, Record<string, StatAvg> | null> | null
  data: { player: CardPlayer; log: LogLine[] } | null
  error: string | null
}) {
  if (!playerId) return null
  if (error) return <p className="text-sm text-[var(--color-muted-foreground)] p-2">{error}</p>
  if (!data) {
    return (
      <div className="flex flex-col gap-2 p-2">
        <Skeleton h="2rem" w="60%" />
        <Skeleton h="4rem" />
        <Skeleton h="6rem" />
      </div>
    )
  }
  const { player: p, log } = data
  const fresh = isFreshNews(p.injuryUpdatedAt, p.injuryStatus)
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div>
        <b className="text-xl">
          <PlayerName name={p.name} injuryStatus={p.injuryStatus} />
          {p.isRookie ? (
            <span className="ml-1.5">
              <Chip tone="accent">R</Chip>
            </span>
          ) : null}
        </b>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {[p.position, p.teamCode, fmtSalary(p.salary)].filter(Boolean).join(' · ')} ·{' '}
          {p.teamName ?? 'Free agent'}
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-mns-card p-3 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <b>News</b>
          {p.injuryUpdatedAt ? (
            <span className={'text-xs ' + (fresh ? 'font-bold text-[var(--color-key,#ffb000)]' : 'text-[var(--color-muted-foreground)]')}>
              {fresh ? 'NEW · ' : ''}
              {new Date(p.injuryUpdatedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          ) : null}
        </div>
        {p.injuryStatus ? (
          <p className="mt-1">
            <b
              style={{
                color:
                  p.injuryStatus.toLowerCase() === 'out'
                    ? 'var(--color-pick-loss, #ff453a)'
                    : 'var(--color-key, #ffb000)',
              }}
            >
              {p.injuryStatus}
            </b>
            {p.injuryNote ? <> — {p.injuryNote}</> : null}
          </p>
        ) : (
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            No injury news — not on the league report.
          </p>
        )}
      </div>

      {ranges ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-mns-card">
          <table className="w-full text-xs tabular-nums whitespace-nowrap">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted-foreground)]">
                <th className="text-left px-3 py-1.5 font-bold">Averages</th>
                {['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'FG%', 'CAT', 'CAT$', 'GP'].map((h) => (
                  <th key={h} className="text-right px-2 py-1.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RANGE_LABELS.filter(([k]) => ranges[k]).map(([k, label]) => {
                const a = ranges[k]?.[playerId]
                return (
                  <tr key={k} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-1.5 font-semibold">{label}</td>
                    <td className="px-2 text-right">{a?.ppg ?? '—'}</td>
                    <td className="px-2 text-right">{a?.rpg ?? '—'}</td>
                    <td className="px-2 text-right">{a?.apg ?? '—'}</td>
                    <td className="px-2 text-right">{a?.spg ?? '—'}</td>
                    <td className="px-2 text-right">{a?.bpg ?? '—'}</td>
                    <td className="px-2 text-right">{a?.tpg ?? '—'}</td>
                    <td className="px-2 text-right">{a?.fgPct != null ? `${a.fgPct}%` : '—'}</td>
                    <td className="px-2 text-right font-semibold">{a?.cat != null ? a.cat.toFixed(2) : '—'}</td>
                    <td className="px-2 text-right font-semibold">{a?.catD != null ? a.catD.toFixed(2) : '—'}</td>
                    <td className="px-2 text-right">{a?.gp ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {log.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-mns-card">
          <table className="w-full text-xs tabular-nums whitespace-nowrap">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted-foreground)]">
                <th className="text-left px-3 py-1.5 font-bold">Last games</th>
                {['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'FG', 'TO'].map((h) => (
                  <th key={h} className="text-right px-2 py-1.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.date} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-1.5">{fmtDate(l.date)}</td>
                  <td className="px-2 text-right">{l.min}</td>
                  <td className="px-2 text-right font-semibold">{l.pts}</td>
                  <td className="px-2 text-right">{l.reb}</td>
                  <td className="px-2 text-right">{l.ast}</td>
                  <td className="px-2 text-right">{l.stl}</td>
                  <td className="px-2 text-right">{l.blk}</td>
                  <td className="px-2 text-right">{l.tpm}</td>
                  <td className="px-2 text-right">{`${l.fgm}-${l.fga}`}</td>
                  <td className="px-2 text-right">{l.tov}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">No games on file yet.</p>
      )}
    </div>
  )
}
