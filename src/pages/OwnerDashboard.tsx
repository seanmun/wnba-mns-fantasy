import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { Button, Chip, EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'
import { useLeague } from '../contexts/LeagueContext'

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
  avg?: {
    gp: number
    ppg: number
    rpg: number
    apg: number
    fgPct: number
  } | null
}

const M = 1_000_000
const fmtM = (n: number) => `$${(n / M).toFixed(1)}M`

// The cap picture, mns-style: one bar, four thresholds, current dues.
function CapCard({
  capUsed,
  cap,
  fees,
}: {
  capUsed: number
  cap: { floor: number; base: number; firstApron: number; secondApron: number; hardCap: number }
  fees: { firstApronFee: number; penaltyRatePerM: number }
}) {
  const pct = (v: number) => Math.min(100, (v / cap.hardCap) * 100)
  const thresholds = [
    { label: 'floor', value: cap.floor, color: 'var(--color-muted-foreground)' },
    { label: '1st apron', value: cap.firstApron, color: 'var(--color-key, #ffb000)' },
    { label: '2nd apron', value: cap.secondApron, color: 'var(--color-pick-pending, #00e5ff)' },
    { label: 'hard cap', value: cap.hardCap, color: 'var(--color-pick-loss, #ff453a)' },
  ].filter((t) => t.value > 0)
  const overSecond = Math.max(0, capUsed - cap.secondApron)
  const dues =
    (capUsed > cap.firstApron ? fees.firstApronFee : 0) +
    Math.ceil(overSecond / M) * fees.penaltyRatePerM
  return (
    <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-mns-card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Salary cap
        </span>
        <span className="tabular-nums">
          <b>{fmtM(capUsed)}</b>
          <span className="text-sm text-[var(--color-muted-foreground)]">
            {' '}of {fmtM(cap.hardCap)} · {fmtM(Math.max(0, cap.hardCap - capUsed))} room
          </span>
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct(capUsed)}%`,
            background:
              capUsed > cap.secondApron
                ? 'var(--color-pick-loss, #ff453a)'
                : capUsed > cap.firstApron
                  ? 'var(--color-key, #ffb000)'
                  : 'var(--color-accent)',
          }}
        />
        {thresholds.map((t) => (
          <div
            key={t.label}
            className="absolute inset-y-0 w-0.5"
            style={{ left: `${pct(t.value)}%`, background: t.color }}
          />
        ))}
      </div>
      <div className="mt-2 mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {thresholds.map((t) => (
          <span key={t.label} className="inline-flex items-center gap-1.5 text-[0.72rem] tabular-nums" style={{ color: t.color }}>
            <span aria-hidden="true" style={{ width: 10, height: 3, borderRadius: 2, background: t.color, display: 'inline-block' }} />
            {t.label} {fmtM(t.value)}
          </span>
        ))}
      </div>
      <p className="text-sm">
        {capUsed > cap.secondApron ? (
          <b className="text-[var(--color-pick-loss,#ff453a)]">
            {fmtM(overSecond)} over the 2nd apron — dues at ${dues} (${fees.penaltyRatePerM}/M over)
          </b>
        ) : capUsed > cap.firstApron ? (
          <b style={{ color: '#ffb000' }}>Over the 1st apron — ${fees.firstApronFee} fee applies</b>
        ) : capUsed < cap.floor ? (
          <span className="text-[var(--color-muted-foreground)]">Below the floor ({fmtM(cap.floor)}).</span>
        ) : (
          <span className="text-[var(--color-accent)]">Under both aprons — no cap dues.</span>
        )}
      </p>
    </div>
  )
}

// A team's page: the roster, who owns it, cap usage. Reached from the
// Teams grid (any team) or the My Team tab (yours). Waivers and trades
// change what shows here; this page just tells the truth about now.
export function OwnerDashboard() {
  const { leagueId = '', teamId } = useParams()
  const { user } = useUser()
  const { apiFetch } = useApi()
  const { currentLeague } = useLeague()
  const [teams, setTeams] = useState<TeamInfo[] | null>(null)
  const [players, setPlayers] = useState<RosterPlayer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    Promise.all([
      apiFetch<TeamInfo[]>(`/api/leagues/${leagueId}/teams`),
      apiFetch<RosterPlayer[]>(`/api/leagues/${leagueId}/players`),
    ])
      .then(([t, p]) => {
        setTeams(t)
        setPlayers(p)
      })
      .catch((e: Error) => setError(e.message))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [apiFetch, leagueId])

  const moveSlot = async (playerId: string, slot: 'active' | 'bench' | 'ir') => {
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/roster`, {
        method: 'POST',
        body: JSON.stringify({ playerId, slot }),
      })
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Move failed')
    } finally {
      setBusy(false)
    }
  }

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
  const bySlot = (s: string) => roster.filter((p) => (p.slot ?? 'active') === s)
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
      {currentLeague?.config.cap?.enabled ? (
        <CapCard capUsed={capUsed} cap={currentLeague.config.cap} fees={currentLeague.config.fees} />
      ) : null}
      {roster.length === 0 ? (
        <EmptyState title="No players yet">
          The roster fills from the draft, waivers and trades.
        </EmptyState>
      ) : (
        <>
          {(
            [
              ['active', 'Active — these score', bySlot('active')],
              ['bench', 'Bench — not scoring', bySlot('bench')],
              ['ir', 'IR — not scoring', bySlot('ir')],
            ] as const
          ).map(([slotKey, label, list]) =>
            slotKey === 'active' || list.length > 0 || mine ? (
              <section key={slotKey} className="mb-5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
                  {label} ({list.length})
                </h2>
                <ul className="flex flex-col gap-2">
                  {list.map((p) => (
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
                          </>
                        }
                        sub={`${[p.position, p.teamCode, p.salary != null ? fmtM(p.salary) : null]
                          .filter(Boolean)
                          .join(' · ')}${p.avg && p.avg.gp > 0 ? ` — ${p.avg.gp}g · ${p.avg.ppg}p ${p.avg.rpg}r ${p.avg.apg}a · ${p.avg.fgPct}%` : ''}`}
                        end={
                          mine ? (
                            <span className="flex gap-1">
                              {slotKey !== 'active' ? (
                                <Button variant="quiet" onClick={() => moveSlot(p.id, 'active')} disabled={busy}>
                                  Start
                                </Button>
                              ) : null}
                              {slotKey !== 'bench' ? (
                                <Button variant="quiet" onClick={() => moveSlot(p.id, 'bench')} disabled={busy}>
                                  Bench
                                </Button>
                              ) : null}
                              {slotKey !== 'ir' ? (
                                <Button variant="quiet" onClick={() => moveSlot(p.id, 'ir')} disabled={busy}>
                                  IR
                                </Button>
                              ) : null}
                            </span>
                          ) : p.salary != null ? (
                            <span className="text-[0.9rem] text-[var(--color-muted-foreground)] tabular-nums">
                              ${p.salary.toLocaleString()}
                            </span>
                          ) : undefined
                        }
                      />
                    </li>
                  ))}
                  {list.length === 0 ? (
                    <p className="text-sm text-[var(--color-muted-foreground)]">Empty.</p>
                  ) : null}
                </ul>
              </section>
            ) : null
          )}
        </>
      )}
    </div>
  )
}
