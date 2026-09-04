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
interface StandingsRow {
  id: string
  name: string
  owners: StandingsTeamOwner[]
  wins?: number
  losses?: number
  ties?: number
  pointsFor?: number
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
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-2">
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
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
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
      <ul className="flex flex-col gap-2">
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
    </div>
  )
}
