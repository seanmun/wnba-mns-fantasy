import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useApi } from '../hooks/useApi'
import { EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'

interface StandingsTeamOwner {
  userId: string | null
  displayName: string | null
  email: string
}
interface Production {
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tpm: number
  tov: number
  fgm: number
  fga: number
  ftm: number
  fta: number
  fgPct: number
  ftPct: number
  ato: number
}
interface StandingsRow {
  id: string
  name: string
  logo?: string | null
  owners: StandingsTeamOwner[]
  wins?: number
  losses?: number
  ties?: number
  pointsFor?: number
  production?: Production
}

// The leaderboard, nothing else. Until matchups grade (the scoring
// pipeline fills wins/points), every team shows 0-0 honestly rather
// than a fake ranking.
export function Standings() {
  const { leagueId = '' } = useParams()
  const { user } = useUser()
  const { apiFetch } = useApi()
  const [rows, setRows] = useState<StandingsRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<StandingsRow[]>(`/api/leagues/${leagueId}/standings`)
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch(() =>
        // Standings endpoint lands with the scoring pipeline; the teams
        // list is the graceful fallback until then.
        apiFetch<StandingsRow[]>(`/api/leagues/${leagueId}/teams`)
          .then((r) => {
            if (!cancelled) setRows(r)
          })
          .catch((e: Error) => {
            if (!cancelled) setError(e.message)
          })
      )
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (rows == null) {
    return (
      <div className="mns-page py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="50%" />
        <Skeleton h="3.4rem" />
        <Skeleton h="3.4rem" />
      </div>
    )
  }

  const graded = rows.some((r) => (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0) > 0)
  const sorted = [...rows].sort(
    (a, b) =>
      (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0)
  )

  return (
    <div className="mns-page py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        title="Standings"
        status={
          graded
            ? 'Wins rank it; total points break ties.'
            : 'Records fill in once matchups count.'
        }
      />
      <ul className="flex flex-col gap-2 mb-8">
        {sorted.map((t, i) => {
          const mine = t.owners?.some((o) => o.userId != null && o.userId === user?.id)
          return (
            <li key={t.id}>
              <ListRow
                mine={mine}
                lead={graded ? i + 1 : '—'}
                title={t.name}
                sub={(t.owners ?? [])
                  .map((o) => o.displayName ?? o.email.split('@')[0])
                  .join(' · ')}
                end={
                  <span>
                    <b className="block text-[1.1rem] leading-tight">
                      {t.wins ?? 0}-{t.losses ?? 0}
                      {t.ties ? `-${t.ties}` : ''}
                    </b>
                    <span className="block text-[0.78rem] text-[var(--color-muted-foreground)]">
                      {t.pointsFor != null ? `${t.pointsFor.toFixed(1)} pts` : 'no games yet'}
                    </span>
                  </span>
                }
              />
            </li>
          )
        })}
      </ul>

      {/* Category production: what each CURRENT roster has generated
          this season, ratios from raw sums. Best in each column lit —
          the research view (and the shape the assistant will read). */}
      {sorted.some((t) => t.production && t.production.fga > 0) ? (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
            Category production — season totals
          </h2>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-mns-card mb-4">
            <table className="w-full text-sm tabular-nums whitespace-nowrap">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
                  <th className="sticky left-0 bg-mns-card text-left font-bold px-3 py-2">Team</th>
                  {['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'FG%', 'FT%', 'A/TO', 'TO'].map((h) => (
                    <th key={h} className="text-right font-bold px-2 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => {
                  const pr = t.production
                  if (!pr) return null
                  const best = (k: keyof Production, lowIsGood = false) => {
                    const vals = sorted.map((x) => x.production?.[k] ?? 0)
                    const target = lowIsGood ? Math.min(...vals) : Math.max(...vals)
                    return (pr[k] ?? 0) === target && vals.some((v) => v !== vals[0])
                  }
                  const cell = (k: keyof Production, v: string | number, lowIsGood = false) => (
                    <td
                      className={
                        'px-2 text-right ' +
                        (best(k, lowIsGood) ? 'font-bold text-[var(--color-accent)]' : '')
                      }
                    >
                      {v}
                    </td>
                  )
                  return (
                    <tr key={t.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="sticky left-0 bg-mns-card px-3 py-1.5 font-semibold">
                        <span className="flex items-center gap-1.5">
                          {t.logo ? (
                            <img src={t.logo} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ) : null}
                          <span className="max-w-[7rem] truncate">{t.name}</span>
                        </span>
                      </td>
                      {cell('pts', pr.pts)}
                      {cell('reb', pr.reb)}
                      {cell('ast', pr.ast)}
                      {cell('stl', pr.stl)}
                      {cell('blk', pr.blk)}
                      {cell('tpm', pr.tpm)}
                      {cell('fgPct', `${pr.fgPct}%`)}
                      {cell('ftPct', `${pr.ftPct}%`)}
                      {cell('ato', pr.ato)}
                      {cell('tov', pr.tov, true)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            Production counts every game a player on the CURRENT roster has played this season —
            a strength read, not the matchup score.
          </p>
        </>
      ) : null}
    </div>
  )
}
