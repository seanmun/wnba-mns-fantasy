import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { Button, EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'
import { useLeague } from '../contexts/LeagueContext'
import { PlayerName } from '../components/InjuryTag'
import { COUNTS_AGAINST_CAP, HOLDS_ROSTER_SPOT } from '../lib/season/roster'
import type { StatAvg } from '../components/StatTable'

interface TeamRow {
  id: string
  name: string
  owners: Array<{ userId: string | null }>
}
interface RosterPlayer {
  id: string
  name: string
  position: string | null
  teamCode: string | null
  salary: number | null
  teamId: string | null
  slot?: string | null
  injuryStatus?: string | null
}
interface PickAsset {
  id: string
  seasonYear: number
  round: number
  originalTeamId: string
  ownerTeamId: string
  displayName: string
}
interface Proposal {
  id: string
  status: string
  proposedByTeamName: string
  involvedTeamNames: string[]
  assets: Array<{ id: string; displayName: string; fromTeamId: string; toTeamId: string }>
  note: string | null
  mineToAnswer: boolean
  mineToCancel: boolean
}

const fmtSalary = (n: number | null) => (n != null ? `$${(n / 1000).toFixed(0)}k` : '')

// Trades: pick a team, pick players both ways, propose. The other
// owner accepts or rejects; acceptance revalidates rosters and the cap
// before anything moves — a stale deal voids instead of executing.
export function TradeMachine() {
  const { leagueId = '' } = useParams()
  const { apiFetch } = useApi()
  const [teams, setTeams] = useState<TeamRow[] | null>(null)
  const [players, setPlayers] = useState<RosterPlayer[] | null>(null)
  const { currentLeague } = useLeague()
  const [trades, setTrades] = useState<{ myTeamId: string | null; deadlinePassed: boolean; picks: PickAsset[]; proposals: Proposal[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [withTeam, setWithTeam] = useState<string | null>(null)
  const [give, setGive] = useState<string[]>([])
  const [get, setGet] = useState<string[]>([])
  const [givePicks, setGivePicks] = useState<string[]>([])
  const [getPicks, setGetPicks] = useState<string[]>([])
  const [seasonStats, setSeasonStats] = useState<Record<string, StatAvg>>({})
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    Promise.all([
      apiFetch<TeamRow[]>(`/api/leagues/${leagueId}/teams`),
      apiFetch<RosterPlayer[]>(`/api/leagues/${leagueId}/players`),
      apiFetch<{ myTeamId: string | null; deadlinePassed: boolean; picks: PickAsset[]; proposals: Proposal[] }>(`/api/leagues/${leagueId}/trades`),
    ])
      .then(([t, p, tr]) => {
        setTeams(t)
        setPlayers(p)
        setTrades(tr)
      })
      .catch((e: Error) => setError(e.message))
    apiFetch<{ season: Record<string, StatAvg> }>(`/api/leagues/${leagueId}/stats`)
      .then((r) => setSeasonStats(r.season ?? {}))
      .catch(() => setSeasonStats({}))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [leagueId])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (!teams || !players || !trades) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="50%" />
        <Skeleton h="3.4rem" />
        <Skeleton h="3.4rem" />
      </div>
    )
  }

  const myTeamId = trades.myTeamId
  const act = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true)
    try {
      const r = await apiFetch<{ needsFix?: Array<{ teamId: string; over: number }> }>(
        `/api/leagues/${leagueId}/trades`,
        { method: 'POST', body: JSON.stringify(body) }
      )
      toast.success(okMsg)
      if (r.needsFix?.length) {
        for (const fix of r.needsFix) {
          const name = teams?.find((t) => t.id === fix.teamId)?.name ?? 'A team'
          toast.warning(
            `${name} is ${fix.over} over the roster limit — drop or IR to get legal. Adds are frozen until then.`,
            { duration: 9000 }
          )
        }
      }
      setGive([])
      setGet([])
      setGivePicks([])
      setGetPicks([])
      setWithTeam(null)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const rosterOf = (teamId: string | null) =>
    players.filter((p) => p.teamId === teamId).sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))

  const pending = trades.proposals.filter((p) => p.status === 'pending')
  const history = trades.proposals.filter((p) => p.status !== 'pending').slice(0, 10)

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        title="Trades"
        status={
          trades.deadlinePassed
            ? 'The trade deadline has passed.'
            : 'Deals execute the moment the other owner accepts.'
        }
      />

      {/* ── Pending, needing anyone's answer ── */}
      {pending.length ? (
        <div className="mb-6 flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Open proposals
          </h2>
          {pending.map((p) => (
            <div key={p.id} className="rounded-lg border border-[var(--color-border-interactive)] bg-mns-card p-3 text-sm flex flex-col gap-2">
              <b>{p.proposedByTeamName} proposes:</b>
              {p.assets.map((a) => (
                <span key={a.id} className="text-[var(--color-muted-foreground)]">
                  {a.displayName} → {teams.find((t) => t.id === a.toTeamId)?.name ?? a.toTeamId}
                </span>
              ))}
              {p.note ? <span className="italic">"{p.note}"</span> : null}
              {p.mineToAnswer ? (
                <div className="flex gap-2">
                  <Button onClick={() => act({ action: 'respond', proposalId: p.id, accept: true }, 'Trade executed')} disabled={busy}>
                    Accept
                  </Button>
                  <Button variant="danger" onClick={() => act({ action: 'respond', proposalId: p.id, accept: false }, 'Trade rejected')} disabled={busy}>
                    Reject
                  </Button>
                </div>
              ) : p.mineToCancel ? (
                <div>
                  <Button variant="quiet" onClick={() => act({ action: 'cancel', proposalId: p.id }, 'Proposal cancelled')} disabled={busy}>
                    Cancel my proposal
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-[var(--color-muted-foreground)]">Waiting on the other owner.</span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Build a proposal ── */}
      {myTeamId && !trades.deadlinePassed ? (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
            Propose a trade
          </h2>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {teams
              .filter((t) => t.id !== myTeamId)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setWithTeam(withTeam === t.id ? null : t.id)
                    setGet([])
                    setGetPicks([])
                  }}
                  className={
                    'text-sm rounded-full px-3 py-1.5 border min-h-[2.5rem] ' +
                    (withTeam === t.id
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
                  }
                >
                  {t.name}
                </button>
              ))}
          </div>

          {withTeam ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {(
                [
                  ['You send', myTeamId, give, (id: string) => toggle(give, setGive, id), givePicks, (id: string) => toggle(givePicks, setGivePicks, id)],
                  ['You receive', withTeam, get, (id: string) => toggle(get, setGet, id), getPicks, (id: string) => toggle(getPicks, setGetPicks, id)],
                ] as const
              ).map(([label, teamId, sel, onToggle, selPicks, onTogglePick]) => (
                <div key={label}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1.5">
                    {label}
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {rosterOf(teamId).map((p) => (
                      <li key={p.id}>
                        <ListRow
                          mine={sel.includes(p.id)}
                          title={<PlayerName name={p.name} injuryStatus={p.injuryStatus} />}
                          sub={
                            <>
                              {[p.position, p.teamCode, fmtSalary(p.salary)].filter(Boolean).join(' · ')}
                              {seasonStats[p.id] ? (
                                <span className="block tabular-nums">
                                  {seasonStats[p.id].ppg}p {seasonStats[p.id].rpg}r {seasonStats[p.id].apg}a
                                  {' · '}{seasonStats[p.id].fgPct}%
                                  {seasonStats[p.id].cat != null ? (
                                    <>
                                      {' · CAT '}
                                      <b
                                        style={{
                                          color:
                                            (seasonStats[p.id].cat ?? 0) >= 0
                                              ? 'var(--color-accent)'
                                              : 'var(--color-pick-loss, #ff453a)',
                                        }}
                                      >
                                        {(seasonStats[p.id].cat ?? 0) >= 0 ? '+' : ''}
                                        {seasonStats[p.id].cat?.toFixed(2)}
                                      </b>
                                    </>
                                  ) : null}
                                </span>
                              ) : null}
                            </>
                          }
                          end={
                            <Button variant={sel.includes(p.id) ? 'primary' : 'quiet'} onClick={() => onToggle(p.id)}>
                              {sel.includes(p.id) ? 'In' : 'Add'}
                            </Button>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  <h4 className="mt-3 mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    Future picks
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {trades.picks
                      .filter((pk) => pk.ownerTeamId === teamId)
                      .map((pk) => (
                        <button
                          key={pk.id}
                          onClick={() => onTogglePick(pk.id)}
                          aria-pressed={selPicks.includes(pk.id)}
                          className={
                            'text-xs rounded-full px-2.5 py-1.5 border min-h-[2.5rem] tabular-nums ' +
                            (selPicks.includes(pk.id)
                              ? 'border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
                              : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
                          }
                        >
                          {pk.displayName.replace(' pick', '')}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">Pick a team to deal with.</p>
          )}

          {withTeam && (give.length > 0 || get.length > 0) ? (
            <CategorySwing stats={seasonStats} give={give} get={get} />
          ) : null}

          {withTeam && (give.length + givePicks.length > 0 || get.length + getPicks.length > 0) ? (
            <CapCalculator
              players={players}
              myTeamId={myTeamId}
              withTeam={withTeam}
              withTeamName={teams.find((t) => t.id === withTeam)?.name ?? ''}
              give={give}
              get={get}
              cap={currentLeague?.config.cap ?? null}
              activeSize={currentLeague?.config.roster?.activeSize ?? 10}
            />
          ) : null}

          {withTeam && give.length + givePicks.length > 0 && get.length + getPicks.length > 0 ? (
            <div className="mt-3">
              <Button
                full
                disabled={busy}
                onClick={() =>
                  act(
                    {
                      action: 'propose',
                      toTeamId: withTeam,
                      givePlayerIds: give,
                      getPlayerIds: get,
                      givePickIds: givePicks,
                      getPickIds: getPicks,
                    },
                    'Proposal sent'
                  )
                }
              >
                {busy ? 'Sending…' : `Propose: ${give.length + givePicks.length} for ${get.length + getPicks.length}`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── History ── */}
      {history.length ? (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
            History
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((p) => (
              <li key={p.id} className="rounded bg-mns-card border border-[var(--color-border)] px-3 py-2">
                <b>{p.involvedTeamNames.join(' ↔ ')}</b>{' '}
                <span className={p.status === 'executed' ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted-foreground)]'}>
                  {p.status}
                </span>
                <span className="block text-xs text-[var(--color-muted-foreground)]">
                  {p.assets.map((a) => a.displayName).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

// The salary repercussions, both sides, live as the deal is built:
// cap now → cap after, the swing, and where that lands against the
// aprons and hard cap. Picks carry no salary.
function CapCalculator({
  players,
  myTeamId,
  withTeam,
  withTeamName,
  give,
  get,
  cap,
  activeSize,
}: {
  players: RosterPlayer[]
  myTeamId: string | null
  withTeam: string
  withTeamName: string
  give: string[]
  get: string[]
  cap: { floor: number; firstApron: number; secondApron: number; hardCap: number } | null
  activeSize: number
}) {
  const M = 1_000_000
  const fmtM = (n: number) => `$${(n / M).toFixed(2)}M`
  const salaryOf = (ids: string[]) =>
    ids.reduce((n, id) => {
      const p = players.find((x) => x.id === id)
      return n + (p && COUNTS_AGAINST_CAP(p.slot) ? p.salary ?? 0 : 0)
    }, 0)
  const rosterSalary = (teamId: string | null) =>
    players
      .filter((p) => p.teamId === teamId && COUNTS_AGAINST_CAP(p.slot))
      .reduce((n, p) => n + (p.salary ?? 0), 0)

  const nonIr = (teamId: string | null) =>
    players.filter((p) => p.teamId === teamId && HOLDS_ROSTER_SPOT(p.slot)).length
  const sides = [
    { label: 'You', teamId: myTeamId, out: salaryOf(give), inn: salaryOf(get), outN: give.length, inN: get.length },
    { label: withTeamName, teamId: withTeam, out: salaryOf(get), inn: salaryOf(give), outN: get.length, inN: give.length },
  ]
  return (
    <div className="mt-4 grid sm:grid-cols-2 gap-2">
      {sides.map((side) => {
        const current = rosterSalary(side.teamId)
        const after = current - side.out + side.inn
        const delta = after - current
        const status = !cap
          ? null
          : after > cap.hardCap
            ? { text: `${fmtM(after - cap.hardCap)} OVER the hard cap — this deal can't execute`, color: 'var(--color-pick-loss, #ff453a)' }
            : after > cap.secondApron
              ? { text: `over the 2nd apron · ${fmtM(cap.hardCap - after)} under the hard cap`, color: 'var(--color-pick-pending, #00e5ff)' }
              : after > cap.firstApron
                ? { text: `over the 1st apron · ${fmtM(cap.hardCap - after)} under the hard cap`, color: 'var(--color-key, #ffb000)' }
                : after < cap.floor
                  ? { text: `below the floor (${fmtM(cap.floor)})`, color: 'var(--color-muted-foreground)' }
                  : { text: `${fmtM(cap.hardCap - after)} of room · under both aprons`, color: 'var(--color-accent)' }
        const afterCount = nonIr(side.teamId) - side.outN + side.inN
        return (
          <div key={side.label} className="rounded-lg border border-[var(--color-border)] bg-mns-card p-3 text-sm tabular-nums">
            <b className="block truncate">{side.label}</b>
            <span
              className={
                'block text-xs ' +
                (afterCount > activeSize
                  ? 'font-bold text-[var(--color-key,#ffb000)]'
                  : 'text-[var(--color-muted-foreground)]')
              }
            >
              {afterCount}/{activeSize} spots after
              {afterCount > activeSize ? ' — will need a drop or IR' : ''}
            </span>
            <span className="block">
              {fmtM(current)} → <b>{fmtM(after)}</b>{' '}
              <span className={delta > 0 ? 'text-[var(--color-key,#ffb000)]' : 'text-[var(--color-accent)]'}>
                ({delta >= 0 ? '+' : ''}
                {fmtM(delta)})
              </span>
            </span>
            {status ? (
              <span className="block text-xs mt-0.5" style={{ color: status.color }}>
                {status.text}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// What the deal does to YOUR nightly categories, from season averages:
// incoming minus outgoing, per game. The other side sees the mirror
// image. Ratio cats shown as simple average shift — a guide, not the
// scorer.
function CategorySwing({
  stats,
  give,
  get,
}: {
  stats: Record<string, StatAvg>
  give: string[]
  get: string[]
}) {
  const sum = (ids: string[], k: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'tpg') =>
    ids.reduce((n, id) => n + (stats[id]?.[k] ?? 0), 0)
  const avgOf = (ids: string[], k: 'fgPct') => {
    const vals = ids.map((id) => stats[id]?.[k]).filter((v): v is number => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const catSum = (ids: string[]) => ids.reduce((n, id) => n + (stats[id]?.cat ?? 0), 0)

  const rows: Array<[string, number | null, string?]> = [
    ['PTS', sum(get, 'ppg') - sum(give, 'ppg')],
    ['REB', sum(get, 'rpg') - sum(give, 'rpg')],
    ['AST', sum(get, 'apg') - sum(give, 'apg')],
    ['STL', sum(get, 'spg') - sum(give, 'spg')],
    ['BLK', sum(get, 'bpg') - sum(give, 'bpg')],
    ['3PM', sum(get, 'tpg') - sum(give, 'tpg')],
    [
      'FG%',
      avgOf(get, 'fgPct') != null || avgOf(give, 'fgPct') != null
        ? (avgOf(get, 'fgPct') ?? 0) - (avgOf(give, 'fgPct') ?? 0)
        : null,
      '%',
    ],
    ['CAT', catSum(get) - catSum(give)],
  ]

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-mns-card p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
        Your category swing (per game, season averages)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(([label, v, unit]) => {
          const up = (v ?? 0) > 0.001
          const down = (v ?? 0) < -0.001
          return (
            <span
              key={label}
              className="text-xs rounded-full px-2.5 py-1.5 border border-[var(--color-border)] tabular-nums"
            >
              {label}{' '}
              <b
                style={{
                  color: up
                    ? 'var(--color-accent)'
                    : down
                      ? 'var(--color-pick-loss, #ff453a)'
                      : 'var(--color-muted-foreground)',
                }}
              >
                {v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(unit === '%' ? 1 : label === 'CAT' ? 2 : 1)}${unit ?? ''}`}
              </b>
            </span>
          )
        })}
      </div>
      <p className="mt-1.5 text-[0.68rem] text-[var(--color-muted-foreground)]">
        The other side sees the mirror image. FG% is a simple average shift, not volume-weighted.
      </p>
    </div>
  )
}
