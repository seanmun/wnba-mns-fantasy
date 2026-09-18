import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { Button, EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'
import { useLeague } from '../contexts/LeagueContext'

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
      await apiFetch(`/api/leagues/${leagueId}/trades`, { method: 'POST', body: JSON.stringify(body) })
      toast.success(okMsg)
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
                          title={p.name}
                          sub={[p.position, p.teamCode, fmtSalary(p.salary)].filter(Boolean).join(' · ')}
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

          {withTeam && (give.length + givePicks.length > 0 || get.length + getPicks.length > 0) ? (
            <CapCalculator
              players={players}
              myTeamId={myTeamId}
              withTeam={withTeam}
              withTeamName={teams.find((t) => t.id === withTeam)?.name ?? ''}
              give={give}
              get={get}
              cap={currentLeague?.config.cap ?? null}
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
}: {
  players: RosterPlayer[]
  myTeamId: string | null
  withTeam: string
  withTeamName: string
  give: string[]
  get: string[]
  cap: { floor: number; firstApron: number; secondApron: number; hardCap: number } | null
}) {
  const M = 1_000_000
  const fmtM = (n: number) => `$${(n / M).toFixed(2)}M`
  const salaryOf = (ids: string[]) =>
    ids.reduce((n, id) => n + (players.find((p) => p.id === id)?.salary ?? 0), 0)
  const rosterSalary = (teamId: string | null) =>
    players.filter((p) => p.teamId === teamId).reduce((n, p) => n + (p.salary ?? 0), 0)

  const sides = [
    { label: 'You', teamId: myTeamId, out: salaryOf(give), inn: salaryOf(get) },
    { label: withTeamName, teamId: withTeam, out: salaryOf(get), inn: salaryOf(give) },
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
        return (
          <div key={side.label} className="rounded-lg border border-[var(--color-border)] bg-mns-card p-3 text-sm tabular-nums">
            <b className="block truncate">{side.label}</b>
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
