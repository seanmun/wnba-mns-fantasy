import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'
import type { Player, PlayerSlot } from '../types/player'
import type { Team } from '../types/team'

type Filter = 'all' | 'unassigned' | 'assigned'

export function AdminRosterManager() {
  const { user } = useUser()
  const { currentLeague, loading: leagueLoading } = useLeague()
  const { apiFetch } = useApi()

  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')

  const leagueId = currentLeague?.id
  const isCommissioner =
    !!user && !!currentLeague && currentLeague.commissionerId === user.id

  useEffect(() => {
    if (!leagueId) return
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const [p, t] = await Promise.all([
          apiFetch<Player[]>(`/api/leagues/${leagueId}/players`),
          apiFetch<Team[]>(`/api/leagues/${leagueId}/teams`),
        ])
        if (cancelled) return
        setPlayers(p)
        setTeams(t)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [leagueId, apiFetch])

  const teamById = useMemo(() => {
    const m = new Map<string, Team>()
    for (const t of teams) m.set(t.id, t)
    return m
  }, [teams])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.teamCode.toLowerCase().includes(q)) {
        return false
      }
      if (filter === 'unassigned' && p.teamId !== null) return false
      if (filter === 'assigned' && p.teamId === null) return false
      if (teamFilter !== 'all' && p.teamId !== teamFilter) return false
      return true
    })
  }, [players, search, filter, teamFilter])

  const updatePlayer = useCallback(
    async (playerId: string, patch: Partial<Player>) => {
      if (!leagueId) return
      // Optimistic local update
      setPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, ...patch } : p))
      )
      try {
        await apiFetch(`/api/leagues/${leagueId}/players/${playerId}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Save failed')
        // Reload to undo optimistic
        try {
          const fresh = await apiFetch<Player[]>(`/api/leagues/${leagueId}/players`)
          setPlayers(fresh)
        } catch {
          // ignore
        }
      }
    },
    [leagueId, apiFetch]
  )

  if (leagueLoading) return <Centered>Loading…</Centered>

  if (!currentLeague) {
    return (
      <Centered>
        <p className="mb-4">No league selected.</p>
        <Link to="/teams" className="text-green-400 hover:text-green-300">
          ← Pick a league
        </Link>
      </Centered>
    )
  }

  if (!isCommissioner) {
    return (
      <Centered>
        <p className="mb-4">Only the commissioner can manage rosters.</p>
        <Link
          to={`/league/${currentLeague.id}`}
          className="text-green-400 hover:text-green-300"
        >
          ← Back to league
        </Link>
      </Centered>
    )
  }

  const unassignedCount = players.filter((p) => p.teamId === null).length
  const assignedCount = players.length - unassignedCount

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Roster Manager</h1>
          <p className="text-gray-400 mt-1">
            {currentLeague.name} · {players.length} players · {assignedCount} assigned · {unassignedCount} free agents
          </p>
        </div>
        <Link
          to={`/league/${currentLeague.id}`}
          className="text-sm text-gray-400 hover:text-white"
        >
          ← Back to league
        </Link>
      </div>

      {players.length === 0 && !loading && (
        <div className="bg-mns-card border border-gray-800 rounded-lg p-8 text-center">
          <div className="text-4xl mb-3">🏀</div>
          <p className="font-semibold mb-2">No players in the pool yet.</p>
          <p className="text-gray-400 text-sm mb-4">
            Populate the player pool first from the league home.
          </p>
          <Link
            to={`/league/${currentLeague.id}`}
            className="inline-block px-5 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg"
          >
            ← Back to league
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {players.length > 0 && (
        <>
          <div className="bg-mns-card border border-gray-800 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or WNBA team..."
              className="flex-1 min-w-[200px] px-3 py-2 bg-mns-dark border border-gray-700 rounded text-white placeholder-gray-500 focus:border-green-400 focus:outline-none"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="px-3 py-2 bg-mns-dark border border-gray-700 rounded text-white focus:border-green-400 focus:outline-none"
            >
              <option value="all">All players</option>
              <option value="unassigned">Free agents only</option>
              <option value="assigned">Assigned only</option>
            </select>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-3 py-2 bg-mns-dark border border-gray-700 rounded text-white focus:border-green-400 focus:outline-none"
            >
              <option value="all">Any team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.abbrev})
                </option>
              ))}
            </select>
            <div className="text-sm text-gray-400">{filtered.length} shown</div>
          </div>

          {loading ? (
            <Centered>Loading players…</Centered>
          ) : (
            <div className="bg-mns-card border border-gray-800 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-mns-hover text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Player</th>
                    <th className="px-3 py-2 text-left">WNBA</th>
                    <th className="px-3 py-2 text-left">Pos</th>
                    <th className="px-3 py-2 text-right">Salary</th>
                    <th className="px-3 py-2 text-left">Assigned To</th>
                    <th className="px-3 py-2 text-left">Slot</th>
                    <th className="px-3 py-2 text-left">Prior Round</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      teams={teams}
                      teamById={teamById}
                      onUpdate={updatePlayer}
                    />
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-6 text-center text-gray-400">
                  No players match your filters.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PlayerRow({
  player,
  teams,
  teamById,
  onUpdate,
}: {
  player: Player
  teams: Team[]
  teamById: Map<string, Team>
  onUpdate: (id: string, patch: Partial<Player>) => Promise<void>
}) {
  const [round, setRound] = useState<string>(
    player.keeperPriorYearRound !== null ? String(player.keeperPriorYearRound) : ''
  )

  useEffect(() => {
    setRound(
      player.keeperPriorYearRound !== null ? String(player.keeperPriorYearRound) : ''
    )
  }, [player.keeperPriorYearRound])

  const assignedTeam = player.teamId ? teamById.get(player.teamId) : null

  return (
    <tr className="border-t border-gray-800 hover:bg-mns-hover/40">
      <td className="px-3 py-2">
        <div className="font-semibold text-white">{player.name}</div>
        {player.isRookie && (
          <span className="text-xs text-pink-400">Rookie</span>
        )}
      </td>
      <td className="px-3 py-2 text-gray-300">{player.teamCode || '—'}</td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={player.position}
          onChange={(e) => onUpdate(player.id, { position: e.target.value.toUpperCase() })}
          maxLength={6}
          className="w-16 px-2 py-1 bg-mns-dark border border-gray-700 rounded text-white uppercase text-center"
        />
      </td>
      <td className="px-3 py-2 text-right text-gray-300 tabular-nums">
        ${player.salary.toLocaleString()}
      </td>
      <td className="px-3 py-2">
        <select
          value={player.teamId ?? ''}
          onChange={(e) =>
            onUpdate(player.id, { teamId: e.target.value || null })
          }
          className="px-2 py-1 bg-mns-dark border border-gray-700 rounded text-white"
        >
          <option value="">Free agent</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.abbrev}
            </option>
          ))}
        </select>
        {assignedTeam && (
          <div className="text-xs text-gray-500 mt-0.5">{assignedTeam.name}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <select
          value={player.slot}
          onChange={(e) =>
            onUpdate(player.id, { slot: e.target.value as PlayerSlot })
          }
          disabled={!player.teamId}
          className="px-2 py-1 bg-mns-dark border border-gray-700 rounded text-white disabled:opacity-40"
        >
          <option value="active">Active</option>
          <option value="bench">Bench</option>
          <option value="ir">IR</option>
          <option value="redshirt">Redshirt</option>
          <option value="international">Int'l</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={1}
          max={20}
          value={round}
          onChange={(e) => setRound(e.target.value)}
          onBlur={() => {
            const v = round === '' ? null : Number(round)
            if (v !== player.keeperPriorYearRound) {
              onUpdate(player.id, { keeperPriorYearRound: v })
            }
          }}
          placeholder="—"
          className="w-16 px-2 py-1 bg-mns-dark border border-gray-700 rounded text-white text-center"
        />
      </td>
    </tr>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-300">
      {children}
    </div>
  )
}
