import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useApi } from '../hooks/useApi'
import { Chip, EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'

interface OwnerInfo {
  userId: string | null
  displayName: string | null
  email: string
}
interface TeamInfo {
  id: string
  name: string
  owners: OwnerInfo[]
}
interface RosterPlayer {
  id: string
  name: string
  position: string | null
  salary: number | null
  teamCode: string | null
  teamId: string | null
  slot: string | null
  onIR: boolean
  isRookie: boolean
  keeperRound?: number | null
}

// A team's page: the roster, who owns it, cap usage. Reached from the
// Teams grid (any team) or the My Team tab (yours). Waivers and trades
// change what shows here; this page just tells the truth about now.
export function OwnerDashboard() {
  const { leagueId = '', teamId } = useParams()
  const { user } = useUser()
  const { apiFetch } = useApi()
  const [teams, setTeams] = useState<TeamInfo[] | null>(null)
  const [players, setPlayers] = useState<RosterPlayer[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiFetch<TeamInfo[]>(`/api/leagues/${leagueId}/teams`),
      apiFetch<RosterPlayer[]>(`/api/leagues/${leagueId}/players`),
    ])
      .then(([t, p]) => {
        if (cancelled) return
        setTeams(t)
        setPlayers(p)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (teams == null || players == null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="55%" />
        <Skeleton h="3.4rem" />
        <Skeleton h="3.4rem" />
        <Skeleton h="3.4rem" />
      </div>
    )
  }

  // /my-team resolves to the team the caller owns; /team/:teamId shows
  // any team in the league.
  const team = teamId
    ? teams.find((t) => t.id === teamId)
    : teams.find((t) => t.owners.some((o) => o.userId != null && o.userId === user?.id))

  if (!team) {
    return (
      <EmptyState title={teamId ? 'Team not found' : "You don't own a team here"}>
        {teamId
          ? 'That team is not in this league.'
          : 'Ask the commissioner to add you as an owner — the invite email links your account by address.'}
      </EmptyState>
    )
  }

  const roster = players
    .filter((p) => p.teamId === team.id)
    .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))
  const capUsed = roster.reduce((n, p) => n + (p.salary ?? 0), 0)
  const mine = team.owners.some((o) => o.userId != null && o.userId === user?.id)

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        eyebrow={mine ? 'My team' : 'Team'}
        title={team.name}
        status={`${team.owners.map((o) => o.displayName ?? o.email.split('@')[0]).join(' · ') || 'No owner yet'} · ${roster.length} players · $${capUsed.toLocaleString()} cap`}
      />
      {roster.length === 0 ? (
        <EmptyState title="No players yet">
          The roster fills from the draft, waivers and trades.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {roster.map((p) => (
            <li key={p.id}>
              <ListRow
                title={
                  <>
                    {p.name}
                    {p.isRookie ? (
                      <span className="ml-1.5">
                        <Chip tone="accent">R</Chip>
                      </span>
                    ) : null}
                    {p.onIR ? (
                      <span className="ml-1.5">
                        <Chip tone="loss">IR</Chip>
                      </span>
                    ) : null}
                  </>
                }
                sub={[p.position, p.teamCode].filter(Boolean).join(' · ')}
                end={
                  p.salary != null ? (
                    <span className="text-[0.9rem] text-[var(--color-muted-foreground)] tabular-nums">
                      ${p.salary.toLocaleString()}
                    </span>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
