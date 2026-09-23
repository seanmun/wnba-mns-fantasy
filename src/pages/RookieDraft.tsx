import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'
import { Button, EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'
import { PlayerName } from '../components/InjuryTag'

interface PickRow {
  id: string
  seasonYear: number
  round: number
  pickInRound: number
  overallPick: number
  teamId: string
  playerId: string | null
  playerName: string | null
}
interface TeamRow {
  id: string
  name: string
  owners: Array<{ userId: string | null }>
}
interface PoolPlayer {
  id: string
  name: string
  position: string | null
  teamCode: string | null
  salary: number | null
  teamId: string | null
  isRookie: boolean
  injuryStatus?: string | null
}

// The rookie draft, slow-draft style: the board IS the clock. Worst
// record picks first, traded slots belong to whoever holds them, and
// the last pick rolls the league forward to keeper season.
export function RookieDraft() {
  const { leagueId = '' } = useParams()
  const { user } = useUser()
  const { apiFetch } = useApi()
  const { currentLeague } = useLeague()
  const [picks, setPicks] = useState<PickRow[] | null>(null)
  const [teams, setTeams] = useState<TeamRow[] | null>(null)
  const [players, setPlayers] = useState<PoolPlayer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  const load = () => {
    Promise.all([
      apiFetch<PickRow[]>(`/api/leagues/${leagueId}/rookie-picks`),
      apiFetch<TeamRow[]>(`/api/leagues/${leagueId}/teams`),
      apiFetch<PoolPlayer[]>(`/api/leagues/${leagueId}/players`),
    ])
      .then(([pk, t, p]) => {
        setPicks(pk)
        setTeams(t)
        setPlayers(p)
      })
      .catch((e: Error) => setError(e.message))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load()
    const timer = setInterval(load, 20000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, leagueId])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (!picks || !teams || !players || !currentLeague) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="55%" />
        <Skeleton h="3.4rem" />
        <Skeleton h="3.4rem" />
      </div>
    )
  }

  const seasonYear = currentLeague.seasonYear
  const board = picks.filter((p) => p.seasonYear === seasonYear)
  const teamName = new Map(teams.map((t) => [t.id, t.name]))
  const myTeam = teams.find((t) => t.owners.some((o) => o.userId != null && o.userId === user?.id))
  const isCommissioner = currentLeague.commissionerId === user?.id
  const inPhase = currentLeague.leaguePhase === 'rookie_draft'
  const onClock = board.find((p) => !p.playerId) ?? null
  const myClock =
    !!onClock && !!myTeam && (onClock.teamId === myTeam.id || isCommissioner)

  const rookiesOnly = players.some((p) => p.teamId == null && p.isRookie)
  const eligible = players
    .filter((p) => p.teamId == null && (!rookiesOnly || p.isRookie))
    .filter((p) => {
      const q = search.trim().toLowerCase()
      return !q || p.name.toLowerCase().includes(q)
    })
    .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))
    .slice(0, 60)

  const generate = async () => {
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/rookie-picks`, {
        method: 'POST',
        body: JSON.stringify({ action: 'generate' }),
      })
      toast.success('Board generated — worst record first, traded picks honored')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const makePick = async (playerId: string) => {
    if (!onClock) return
    setBusy(true)
    try {
      const r = await apiFetch<{ picked: string; nextPhase: string | null }>(
        `/api/leagues/${leagueId}/rookie-picks`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'pick', pickId: onClock.id, playerId }),
        }
      )
      toast.success(`${r.picked} — pick is in`)
      if (r.nextPhase) toast.success('That was the last pick — the rookie draft is complete.')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pick failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        title={`${seasonYear} Rookie draft`}
        status={
          !inPhase
            ? 'The rookie draft runs at the top of the new season.'
            : onClock
              ? `On the clock: ${teamName.get(onClock.teamId) ?? '—'} (${onClock.round}.${onClock.pickInRound})`
              : 'All picks are in.'
        }
      />

      {board.length === 0 ? (
        isCommissioner ? (
          <div className="mb-6 rounded-lg border border-[var(--color-border-interactive)] bg-mns-card p-4">
            <b>No board yet.</b>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              Generate it: worst record from last season picks first, {`round by round`}, and any
              traded pick belongs to whoever holds it.
            </p>
            <div className="mt-3">
              <Button onClick={generate} disabled={busy}>
                {busy ? 'Working…' : 'Generate the board'}
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState title="No board yet">
            The commissioner generates the draft order to open the rookie draft.
          </EmptyState>
        )
      ) : (
        <ul className="flex flex-col gap-1.5 mb-6">
          {board.map((p) => {
            const clock = onClock?.id === p.id
            return (
              <li key={p.id}>
                <ListRow
                  mine={clock}
                  lead={`${p.round}.${p.pickInRound}`}
                  title={teamName.get(p.teamId) ?? p.teamId}
                  sub={
                    p.playerName ??
                    (clock ? (inPhase ? 'On the clock' : 'Next up when the draft opens') : '—')
                  }
                  end={
                    p.playerName ? (
                      <span className="text-[var(--color-accent)] font-semibold text-sm">✓</span>
                    ) : undefined
                  }
                />
              </li>
            )
          })}
        </ul>
      )}

      {inPhase && myClock && onClock ? (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
            {isCommissioner && onClock.teamId !== myTeam?.id
              ? `Pick for ${teamName.get(onClock.teamId)}`
              : 'Your pick'}
            {rookiesOnly ? ' — rookies' : ' — available players'}
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full mb-3 px-4 py-2.5 min-h-[3rem] rounded-lg bg-mns-card border border-[var(--color-border-interactive)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <ul className="flex flex-col gap-1.5">
            {eligible.map((p) => (
              <li key={p.id}>
                <ListRow
                  title={<PlayerName name={p.name} injuryStatus={p.injuryStatus} />}
                  sub={[p.position, p.teamCode, p.salary != null ? `$${(p.salary / 1000).toFixed(0)}k` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  end={
                    <Button onClick={() => makePick(p.id)} disabled={busy}>
                      Draft
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
