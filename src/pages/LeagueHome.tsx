import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'
import { LEAGUE_PHASE_LABELS, LEAGUE_PHASE_ORDER, type LeaguePhase } from '../types/league'

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
        <div className="text-sm text-gray-400 mb-2">
          {league.sport.toUpperCase()} · {league.seasonYear}
        </div>
        {/* Phase chain, legacy-mns style: where the league is in its
            year, at a glance. */}
        <div className="flex items-center gap-1 flex-wrap">
          {LEAGUE_PHASE_ORDER.map((phase: LeaguePhase, idx: number) => {
            const isCurrent = leaguePhase === phase
            const isComplete = LEAGUE_PHASE_ORDER.indexOf(leaguePhase) > idx
            return (
              <span key={phase} className="flex items-center gap-1">
                {idx > 0 ? (
                  <span className={'w-3 h-px ' + (isComplete || isCurrent ? 'bg-green-400/40' : 'bg-gray-700')} />
                ) : null}
                <span
                  className={
                    'px-2 py-0.5 rounded-full text-[0.68rem] font-semibold ' +
                    (isCurrent
                      ? 'bg-green-400/20 text-green-400 border border-green-400/50'
                      : isComplete
                        ? 'bg-gray-800 text-gray-500 border border-gray-700'
                        : 'bg-gray-900 text-gray-600 border border-gray-800')
                  }
                >
                  {LEAGUE_PHASE_LABELS[phase]}
                </span>
              </span>
            )
          })}
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

      {/* This week's matchups — the season's front door, mine first
          and loudest */}
      {leaguePhase === 'regular_season' || leaguePhase === 'playoffs' ? (
        <>
          <WeekMatchups leagueId={league.id} myUserId={user?.id ?? null} />
          <StandingsSection leagueId={league.id} myUserId={user?.id ?? null} />
        </>
      ) : (
        <TeamsSection leagueId={league.id} isCommissioner={isCommissioner} myUserId={user?.id ?? null} />
      )}
    </div>
  )
}

interface WeekMatchup {
  id: string
  status: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  homeScore: number
  awayScore: number
}

function WeekMatchups({ leagueId, myUserId }: { leagueId: string; myUserId: string | null }) {
  const { apiFetch } = useApi()
  const [data, setData] = useState<{ week: number | null; matchups: WeekMatchup[] } | null>(null)
  const [myTeamId, setMyTeamId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiFetch<{ week: number | null; matchups: WeekMatchup[] }>(`/api/leagues/${leagueId}/matchups`),
      apiFetch<Array<{ id: string; owners: Array<{ userId: string | null }> }>>(`/api/leagues/${leagueId}/teams`),
    ])
      .then(([d, teams]) => {
        if (cancelled) return
        setData(d)
        setMyTeamId(teams.find((t) => t.owners.some((o) => o.userId === myUserId))?.id ?? null)
      })
      .catch(() => {
        if (!cancelled) setData({ week: null, matchups: [] })
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId, myUserId])

  if (!data || data.matchups.length === 0) return null
  const isMine = (m: WeekMatchup) => m.homeTeamId === myTeamId || m.awayTeamId === myTeamId
  const sorted = [...data.matchups].sort((a, b) => Number(isMine(b)) - Number(isMine(a)))

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-bold">Week {data.week} matchups</h2>
        <Link to={`/league/${leagueId}/standings`} className="text-sm text-green-400 hover:text-green-300">
          Standings →
        </Link>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {sorted.map((m) => (
          <li key={m.id} className={isMine(m) ? 'sm:col-span-2' : ''}>
            <Link
              to={`/league/${leagueId}/matchup/${m.id}`}
              className={
                'block bg-mns-card hover:bg-mns-hover border rounded-lg px-4 py-3 transition-colors ' +
                (isMine(m) ? 'border-l-4 border-[var(--color-accent)] text-lg' : 'border-gray-800')
              }
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

interface StandingRow {
  id: string
  name: string
  owners: Array<{ userId: string | null; displayName: string | null; email: string }>
  wins: number
  losses: number
  ties: number
  pointsFor: number
  salary: number
}

// The legacy-mns home standings table: rank, team, record, salary —
// tap through to the team page. The full Standings tab stays the
// canonical board; this is the at-a-glance version.
function StandingsSection({ leagueId, myUserId }: { leagueId: string; myUserId: string | null }) {
  const { apiFetch } = useApi()
  const { currentLeague } = useLeague()
  const cap = currentLeague?.config.cap?.enabled ? currentLeague.config.cap : null
  const [rows, setRows] = useState<StandingRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<StandingRow[]>(`/api/leagues/${leagueId}/standings`)
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId])

  if (!rows || rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-bold">Standings</h2>
        <Link to={`/league/${leagueId}/standings`} className="text-sm text-green-400 hover:text-green-300">
          Full standings →
        </Link>
      </div>
      <div className="bg-mns-card rounded-lg border border-gray-800 divide-y divide-gray-800">
        {sorted.map((t, i) => {
          const mine = t.owners.some((o) => o.userId === myUserId)
          return (
            <Link
              key={t.id}
              to={`/league/${leagueId}/team/${t.id}`}
              className={
                'flex items-center gap-3 px-4 py-3 hover:bg-mns-hover transition-colors ' +
                (mine ? 'bg-green-400/5' : '')
              }
            >
              <span className={'w-6 text-lg font-bold tabular-nums ' + (i === 0 ? 'text-green-400' : 'text-gray-500')}>
                {i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">
                  {t.name}
                  {mine ? <span className="ml-2 text-xs text-green-400/80">(you)</span> : null}
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {t.owners.map((o) => o.displayName ?? o.email.split('@')[0]).join(' · ')}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {t.wins}-{t.losses}
                {t.ties ? `-${t.ties}` : ''}
              </span>
              <span className="w-20 flex flex-col items-end gap-1">
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: cap
                      ? t.salary > cap.secondApron
                        ? 'var(--color-pick-loss, #ff453a)'
                        : t.salary > cap.firstApron
                          ? 'var(--color-key, #ffb000)'
                          : 'var(--color-muted-foreground)'
                      : 'var(--color-muted-foreground)',
                  }}
                >
                  ${(t.salary / 1_000_000).toFixed(1)}M
                  {cap && t.salary > cap.secondApron
                    ? ' · 2nd'
                    : cap && t.salary > cap.firstApron
                      ? ' · apron'
                      : ''}
                </span>
                {/* Everyone's cap position on one scale — the mini
                    version of the team page's bar, same colors. */}
                {cap ? (
                  <span className="relative block w-16 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${Math.min(100, (t.salary / cap.hardCap) * 100)}%`,
                        background:
                          t.salary > cap.secondApron
                            ? 'var(--color-pick-loss, #ff453a)'
                            : t.salary > cap.firstApron
                              ? 'var(--color-key, #ffb000)'
                              : 'var(--color-accent)',
                      }}
                    />
                  </span>
                ) : null}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
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

