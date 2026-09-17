import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'
import { LEAGUE_PHASE_LABELS } from '../types/league'

export function LeagueHome() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { user } = useUser()
  const { userLeagues, loading } = useLeague()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
      </div>
    )
  }

  const league = userLeagues.find((l) => l.id === leagueId)

  if (!league) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">League not found</h1>
        <p className="text-gray-400 mb-6">
          You don't have access to this league, or it doesn't exist.
        </p>
        <Link
          to="/teams"
          className="inline-block px-5 py-2.5 bg-mns-card hover:bg-mns-hover border border-gray-700 text-white font-semibold rounded-lg"
        >
          ← Back to your leagues
        </Link>
      </div>
    )
  }

  const isCommissioner = league.commissionerId === user?.id
  const leaguePhase = league.leaguePhase

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl sm:text-4xl font-bold">{league.name}</h1>
          {isCommissioner && (
            <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-green-400/15 text-green-400 border border-green-400/30 rounded-full">
              Commissioner
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
          <span>{league.sport.toUpperCase()} · {league.seasonYear}</span>
          <span className="text-gray-600">·</span>
          <span className="text-pink-400 font-semibold">
            {LEAGUE_PHASE_LABELS[leaguePhase]}
          </span>
        </div>
      </div>

      {/* Manager tools live in their own portal — the home page is a
          member screen for everyone, commissioner included. */}
      {isCommissioner && (
        <Link
          to={`/league/${league.id}/lm`}
          className="mb-8 flex items-center justify-between bg-mns-card hover:bg-mns-hover border border-green-400/30 rounded-lg px-4 py-3"
        >
          <span>
            <b className="text-green-400">Manage league</b>
            <span className="block text-sm text-gray-400">Setup, teams, rosters, draft — the LM tools.</span>
          </span>
          <span className="text-green-400 text-xl">→</span>
        </Link>
      )}

      {/* This week's matchups — the season's front door */}
      {leaguePhase === 'regular_season' || leaguePhase === 'playoffs' ? (
        <WeekMatchups leagueId={league.id} />
      ) : null}

      {/* Teams */}
      <TeamsSection leagueId={league.id} isCommissioner={isCommissioner} myUserId={user?.id ?? null} />
    </div>
  )
}

interface WeekMatchup {
  id: string
  status: string
  homeTeamName: string
  awayTeamName: string
  homeScore: number
  awayScore: number
}

function WeekMatchups({ leagueId }: { leagueId: string }) {
  const { apiFetch } = useApi()
  const [data, setData] = useState<{ week: number | null; matchups: WeekMatchup[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ week: number | null; matchups: WeekMatchup[] }>(`/api/leagues/${leagueId}/matchups`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setData({ week: null, matchups: [] })
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId])

  if (!data || data.matchups.length === 0) return null

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-bold">Week {data.week} matchups</h2>
        <Link to={`/league/${leagueId}/standings`} className="text-sm text-green-400 hover:text-green-300">
          Standings →
        </Link>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.matchups.map((m) => (
          <li key={m.id}>
            <Link
              to={`/league/${leagueId}/matchup/${m.id}`}
              className="block bg-mns-card hover:bg-mns-hover border border-gray-800 rounded-lg px-4 py-3 transition-colors"
            >
              <span className="flex items-center justify-between tabular-nums">
                <span className="font-semibold truncate">{m.awayTeamName}</span>
                <b className="shrink-0 px-2">{m.awayScore}</b>
              </span>
              <span className="flex items-center justify-between tabular-nums">
                <span className="font-semibold truncate">{m.homeTeamName}</span>
                <b className="shrink-0 px-2">{m.homeScore}</b>
              </span>
              <span className="block mt-1 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {m.status === 'final' ? 'Final' : m.status === 'live' ? 'Live — category score' : 'Scheduled'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface HomeTeamOwner {
  id: string
  userId: string | null
  email: string
  displayName: string | null
}
interface HomeTeam {
  id: string
  name: string
  owners: HomeTeamOwner[]
}

function TeamsSection({
  leagueId,
  isCommissioner,
  myUserId,
}: {
  leagueId: string
  isCommissioner: boolean
  myUserId: string | null
}) {
  const { apiFetch } = useApi()
  const [teams, setTeams] = useState<HomeTeam[] | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<HomeTeam[]>(`/api/leagues/${leagueId}/teams`)
      .then((t) => {
        if (!cancelled) setTeams(t)
      })
      .catch(() => {
        if (!cancelled) setTeams([])
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId])

  if (teams == null) return null

  if (teams.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">Teams</h2>
        <div className="bg-mns-card border border-gray-800 rounded-lg p-8 text-center text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-semibold text-gray-300 mb-1">No teams yet</p>
          <p className="text-sm">
            {isCommissioner
              ? 'Add teams from the LM hub to get this league moving.'
              : 'The commissioner is still setting up. Hang tight.'}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-4">Teams</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {teams.map((t) => {
          const mine = t.owners.some((o) => o.userId != null && o.userId === myUserId)
          return (
            <li key={t.id}>
              <Link
                to={`/league/${leagueId}/team/${t.id}`}
                className={
                  'block bg-mns-card hover:bg-mns-hover border rounded-lg px-4 py-3 transition-colors ' +
                  (mine ? 'border-[var(--color-accent)]' : 'border-gray-800')
                }
              >
                <span className="font-semibold text-[var(--color-foreground)]">
                  {t.name}
                  {mine ? (
                    <span className="ml-2 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--color-accent)]">
                      you
                    </span>
                  ) : null}
                </span>
                <span className="block text-sm text-[var(--color-muted-foreground)] truncate">
                  {t.owners.length
                    ? t.owners
                        .map((o) => o.displayName ?? `${o.email.split('@')[0]} (invited)`)
                        .join(' · ')
                    : 'No owner yet'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

