import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { EmptyState, PageHeader, Skeleton } from '../ui/components'

interface WeekTotals {
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tpm: number
  games: number
}
interface SidePlayer {
  id: string
  name: string
  position: string | null
  teamCode: string | null
  week: WeekTotals | null
}
interface MatchupPayload {
  matchup: {
    id: string
    matchupWeek: number
    status: string
    homeTeamName: string
    awayTeamName: string
    homeScore: number
    awayScore: number
    startDate: string
    endDate: string
    result: {
      categories?: string[]
      home?: Record<string, number>
      away?: Record<string, number>
    } | null
  }
  home: SidePlayer[]
  away: SidePlayer[]
}

const fmtCat = (cat: string, v: number | undefined) =>
  v == null ? '—' : cat.includes('%') ? (v * 100).toFixed(1) : cat === 'A/TO' ? v.toFixed(2) : String(Math.round(v))

// One matchup: who's winning which categories, and the week each
// player actually had. Category math mirrors the scorer exactly —
// this page only displays what the scoring pass stored.
export function MatchupDetail() {
  const { leagueId = '', matchupId = '' } = useParams()
  const { apiFetch } = useApi()
  const [data, setData] = useState<MatchupPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<MatchupPayload>(`/api/leagues/${leagueId}/matchups?matchupId=${matchupId}`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId, matchupId])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="60%" />
        <Skeleton h="8rem" />
      </div>
    )
  }

  const { matchup, home, away } = data
  const cats = matchup.result?.categories ?? []

  return (
    <div className="max-w-3xl mx-auto px-4 py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        eyebrow={`Week ${matchup.matchupWeek} · ${matchup.status === 'final' ? 'Final' : matchup.status === 'live' ? 'Live' : 'Scheduled'}`}
        title={
          <span className="tabular-nums">
            {matchup.awayTeamName} {matchup.awayScore} — {matchup.homeScore} {matchup.homeTeamName}
          </span>
        }
        status={`Category score · ${matchup.startDate} to ${matchup.endDate}`}
      />

      {cats.length > 0 && (
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider">
                <th className="text-left py-2">Cat</th>
                <th className="text-right py-2">{matchup.awayTeamName}</th>
                <th className="text-right py-2">{matchup.homeTeamName}</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                const h = matchup.result?.home?.[c]
                const a = matchup.result?.away?.[c]
                const homeWins = (h ?? 0) > (a ?? 0)
                const awayWins = (a ?? 0) > (h ?? 0)
                return (
                  <tr key={c} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 font-semibold">{c}</td>
                    <td className={'text-right py-1.5 ' + (awayWins ? 'text-[var(--color-accent)] font-bold' : '')}>
                      {fmtCat(c, a)}
                    </td>
                    <td className={'text-right py-1.5 ' + (homeWins ? 'text-[var(--color-accent)] font-bold' : '')}>
                      {fmtCat(c, h)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6">
        {(
          [
            [matchup.awayTeamName, away],
            [matchup.homeTeamName, home],
          ] as const
        ).map(([label, side]) => (
          <section key={label}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
              {label}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {side.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-[var(--color-border)] bg-mns-card px-3 py-2"
                >
                  <span className="block font-semibold text-sm">
                    {p.name}
                    <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">
                      {[p.position, p.teamCode].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="block text-xs text-[var(--color-muted-foreground)] tabular-nums">
                    {p.week
                      ? `${p.week.games} gm · ${p.week.pts} pts · ${p.week.reb} reb · ${p.week.ast} ast · ${p.week.stl} stl · ${p.week.blk} blk`
                      : 'no games yet'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
