import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, EllipsisVertical, Settings, X } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Button, Chip, EmptyState, PageHeader, Skeleton } from '../ui/components'
import { useLeague } from '../contexts/LeagueContext'
import { PlayerName } from '../components/InjuryTag'
import { RangeChips, type RangeKey, type StatAvg } from '../components/StatTable'

interface OwnerInfo {
  userId: string | null
  displayName: string | null
  email: string
}
interface TeamInfo {
  id: string
  name: string
  logo?: string | null
  owners: OwnerInfo[]
  picks?: Array<{
    id: string
    seasonYear: number
    round: number
    originalTeamId: string
    originalTeamName: string
  }>
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
  injuryStatus?: string | null
  injuryNote?: string | null
  keeperRound?: number | null
  avg?: {
    gp: number
    ppg: number
    rpg: number
    apg: number
    fgPct: number
  } | null
}
interface DayGame {
  opp: string
  home: boolean
  tip: string
  state: 'pre' | 'in' | 'post'
}
interface DayLine {
  min: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  fgm: number
  fga: number
}
interface PendingClaim {
  id: string
  addNames: string[]
  dropName: string | null
  clearsOn: string
}
interface LineupDay {
  date: string
  today: string
  locked: boolean
  editable: boolean
  slots: Record<string, string>
  games: Record<string, DayGame>
  lines: Record<string, DayLine>
}

const M = 1_000_000
const fmtM = (n: number) => `$${(n / M).toFixed(1)}M`

// Eastern calendar day, same convention as the server.
const ET_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const etToday = () => ET_DAY.format(new Date())
const shiftDate = (date: string, days: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)
const fmtDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
const fmtTip = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  })

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

// A team's page, one DAY at a time: the lineup as set for that date,
// who plays, and the box lines once games run. Yesterday is locked
// history; today and future days are editable, and a slot set ahead
// sticks when its day arrives. Waivers and trades change what shows
// here; this page just tells the truth about the chosen day.
export function OwnerDashboard() {
  const { leagueId = '', teamId } = useParams()
  const { user } = useUser()
  const { apiFetch } = useApi()
  const { currentLeague } = useLeague()
  const [teams, setTeams] = useState<TeamInfo[] | null>(null)
  const [players, setPlayers] = useState<RosterPlayer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selDate, setSelDate] = useState(etToday)
  const [day, setDay] = useState<LineupDay | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null)
  const [claims, setClaims] = useState<PendingClaim[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [range, setRange] = useState<RangeKey>('season')
  const [ranges, setRanges] = useState<Record<string, Record<string, StatAvg> | null> | null>(null)
  const [sortBy, setSortBy] = useState<'gp' | 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'tpg' | 'fgPct' | 'salary'>('ppg')
  const [asc, setAsc] = useState(false)

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

  // /my-team resolves to the team the caller owns; /team/:teamId shows
  // any team in the league.
  const team = teamId
    ? teams?.find((t) => t.id === teamId)
    : teams?.find((t) => t.owners.some((o) => o.userId != null && o.userId === user?.id))

  const loadDay = () => {
    if (!team) return
    apiFetch<LineupDay>(`/api/leagues/${leagueId}/lineup?date=${selDate}&teamId=${team.id}`)
      .then(setDay)
      .catch(() => setDay(null))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadDay, [apiFetch, leagueId, team?.id, selDate])

  // Your pending waiver claim belongs on your team page too — the
  // move already in flight is part of the roster's truth.
  const owned = team?.owners.some((o) => o.userId != null && o.userId === user?.id) ?? false
  useEffect(() => {
    if (!owned) {
      setClaims([])
      return
    }
    apiFetch<{ myClaims: PendingClaim[] }>(`/api/leagues/${leagueId}/waivers`)
      .then((w) => setClaims(w.myClaims ?? []))
      .catch(() => setClaims([]))
  }, [apiFetch, leagueId, owned])

  useEffect(() => {
    apiFetch<Record<string, Record<string, StatAvg> | null>>(`/api/leagues/${leagueId}/stats`)
      .then(setRanges)
      .catch(() => setRanges({}))
  }, [apiFetch, leagueId])

  const moveSlot = async (playerId: string, slot: 'active' | 'bench' | 'ir' | 'drop') => {
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/roster`, {
        method: 'POST',
        body: JSON.stringify(slot === 'drop' ? { playerId, slot } : { playerId, slot, date: selDate }),
      })
      setOpenRow(null)
      setConfirmDrop(null)
      load()
      loadDay()
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

  const today = etToday()
  const minDate = currentLeague?.config.season?.startDate ?? shiftDate(today, -7)
  const maxDate = shiftDate(today, 13)
  const isToday = selDate === today
  const locked = day ? day.locked : selDate < today
  const editable = mine && !locked

  // The day's slot for each player — the daily lineup when loaded,
  // the base slot until then.
  const slotOf = (p: RosterPlayer) => day?.slots[p.id] ?? p.slot ?? 'active'
  const bySlot = (s: string) => roster.filter((p) => slotOf(p) === s)

  const gameNote = (p: RosterPlayer) => {
    if (!day) return null
    const g = p.teamCode ? day.games[p.teamCode] : undefined
    const line = day.lines[p.id]
    if (line && (line.min > 0 || g?.state !== 'pre')) {
      return (
        <span className="text-[var(--color-accent)]">
          {line.pts}p {line.reb}r {line.ast}a{line.stl ? ` ${line.stl}s` : ''}
          {line.blk ? ` ${line.blk}b` : ''} · {line.min} min
        </span>
      )
    }
    if (!g) {
      return <span className="text-[var(--color-muted-foreground)]">no game</span>
    }
    return (
      <span className="text-[var(--color-foreground)]">
        {g.home ? 'vs' : '@'} {g.opp}
        {g.state === 'pre' ? ` · ${fmtTip(g.tip)}` : g.state === 'in' ? ' · live' : ' · final'}
      </span>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
      <div className="relative">
        <PageHeader
          back={`/league/${leagueId}`}
          backLabel="League home"
          eyebrow={mine ? 'My team' : 'Team'}
          title={
            <span className="flex items-center gap-3">
              {team.logo ? (
                <img
                  src={team.logo}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover shrink-0"
                />
              ) : null}
              <span className="min-w-0">{team.name}</span>
            </span>
          }
          status={`${team.owners.map((o) => o.displayName ?? o.email.split('@')[0]).join(' · ') || 'No owner yet'} · ${roster.length} players · $${capUsed.toLocaleString()} cap`}
        />
        <div className="absolute right-0 top-6 flex items-center gap-2">
          {mine ? (
            <Button
              variant="quiet"
              aria-label="Team settings"
              aria-expanded={showSettings}
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      {mine && showSettings ? (
        <TeamSettings leagueId={leagueId} team={team} onSaved={() => { setShowSettings(false); load() }} />
      ) : null}
      {currentLeague?.config.cap?.enabled ? (
        <CapCard capUsed={capUsed} cap={currentLeague.config.cap} fees={currentLeague.config.fees} />
      ) : null}

      {mine && claims.length > 0 ? (
        <div className="mb-4 rounded-lg border border-[var(--color-accent)] bg-mns-card p-3 text-sm">
          <b>Waiver queue in</b> — clears {claims[0].clearsOn} at 8am ET, snake order
          <ol className="mt-1 list-decimal list-inside tabular-nums">
            {claims.map((c) => (
              <li key={c.id}>
                {c.addNames.join(' → ')}
                {c.dropName ? (
                  <span className="text-[var(--color-muted-foreground)]"> · drop {c.dropName}</span>
                ) : null}
              </li>
            ))}
          </ol>
          <Link
            to={`/league/${leagueId}/free-agents`}
            className="mt-1 inline-block font-bold text-[var(--color-accent)]"
          >
            Reorder or withdraw →
          </Link>
        </div>
      ) : null}

      {/* The day carousel: yesterday is history, tomorrow is a plan. */}
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="quiet"
          aria-label="Previous day"
          disabled={selDate <= minDate}
          onClick={() => { setSelDate(shiftDate(selDate, -1)); setOpenRow(null); setConfirmDrop(null) }}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <div className="flex-1 text-center">
          <div className="font-bold">{fmtDay(selDate)}</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            {isToday ? 'Today' : locked ? 'Locked — this day is done' : 'Sets automatically on the day'}
          </div>
        </div>
        <Button
          variant="quiet"
          aria-label="Next day"
          disabled={selDate >= maxDate}
          onClick={() => { setSelDate(shiftDate(selDate, 1)); setOpenRow(null); setConfirmDrop(null) }}
        >
          <ChevronRight aria-hidden />
        </Button>
        {!isToday ? (
          <Button variant="quiet" onClick={() => { setSelDate(today); setOpenRow(null); setConfirmDrop(null) }}>
            Today
          </Button>
        ) : null}
      </div>
      <div className="mb-4 flex justify-end">
        <RangeChips value={range} onChange={setRange} hasLastSeason={!!ranges?.lastSeason} />
      </div>

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
                {list.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)]">Empty.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-mns-card">
                    <table className="w-full text-sm tabular-nums whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          {editable ? <th className="sticky left-0 bg-mns-card w-8 p-0" /> : null}
                          <th
                            className={
                              'sticky bg-mns-card text-left text-xs font-bold text-[var(--color-muted-foreground)] px-2 py-2 ' +
                              (editable ? 'left-8' : 'left-0')
                            }
                          >
                            Player
                          </th>
                          {(
                            [
                              ['gp', 'GP'],
                              ['ppg', 'PTS'],
                              ['rpg', 'REB'],
                              ['apg', 'AST'],
                              ['spg', 'STL'],
                              ['bpg', 'BLK'],
                              ['tpg', '3PM'],
                              ['fgPct', 'FG%'],
                              ['salary', '$'],
                            ] as const
                          ).map(([k, h]) => (
                            <th key={k} className="p-0">
                              <button
                                onClick={() => {
                                  if (sortBy === k) setAsc(!asc)
                                  else {
                                    setSortBy(k)
                                    setAsc(false)
                                  }
                                }}
                                aria-pressed={sortBy === k}
                                className={
                                  'w-full min-h-[2.5rem] px-2 text-right text-xs font-bold ' +
                                  (sortBy === k
                                    ? 'text-[var(--color-accent)]'
                                    : 'text-[var(--color-muted-foreground)]')
                                }
                              >
                                {h}
                                {sortBy === k ? (asc ? ' ↑' : ' ↓') : ''}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...list]
                          .sort((a, b) => {
                            const v = (p: RosterPlayer) =>
                              sortBy === 'salary'
                                ? p.salary ?? 0
                                : ranges?.[range]?.[p.id]?.[sortBy] ?? 0
                            return (asc ? 1 : -1) * (v(a) - v(b))
                          })
                          .map((p) => {
                            const a = ranges?.[range]?.[p.id]
                            const open = openRow === p.id
                            return (
                              <Fragment key={p.id}>
                                <tr className="border-b border-[var(--color-border)] last:border-b-0">
                                  {editable ? (
                                    <td className="sticky left-0 bg-mns-card w-8 px-1">
                                      <button
                                        aria-label={open ? `Close actions for ${p.name}` : `Move ${p.name}`}
                                        aria-expanded={open}
                                        onClick={() => {
                                          setOpenRow(open ? null : p.id)
                                          setConfirmDrop(null)
                                        }}
                                        className="min-h-[2.75rem] px-1 text-[var(--color-muted-foreground)]"
                                      >
                                        {open ? (
                                          <X aria-hidden className="w-4 h-4" />
                                        ) : (
                                          <EllipsisVertical aria-hidden className="w-4 h-4" />
                                        )}
                                      </button>
                                    </td>
                                  ) : null}
                                  <td
                                    className={
                                      'sticky bg-mns-card px-2 py-1.5 max-w-[10rem] ' +
                                      (editable ? 'left-8' : 'left-0')
                                    }
                                  >
                                    <span className="block font-semibold truncate">
                                      <PlayerName name={p.name} injuryStatus={p.injuryStatus} />
                                      {p.isRookie ? (
                                        <span className="ml-1"><Chip tone="accent">R</Chip></span>
                                      ) : null}
                                    </span>
                                    <span className="block text-xs text-[var(--color-muted-foreground)] truncate">
                                      {[p.position, p.teamCode].filter(Boolean).join(' · ')}
                                      {day ? <> — {gameNote(p)}</> : null}
                                    </span>
                                  </td>
                                  <td className="px-2 text-right">{a?.gp ?? 0}</td>
                                  <td className="px-2 text-right font-semibold">{a?.ppg ?? '—'}</td>
                                  <td className="px-2 text-right">{a?.rpg ?? '—'}</td>
                                  <td className="px-2 text-right">{a?.apg ?? '—'}</td>
                                  <td className="px-2 text-right">{a?.spg ?? '—'}</td>
                                  <td className="px-2 text-right">{a?.bpg ?? '—'}</td>
                                  <td className="px-2 text-right">{a?.tpg ?? '—'}</td>
                                  <td className="px-2 text-right">{a?.fgPct != null ? `${a.fgPct}%` : '—'}</td>
                                  <td className="px-2 text-right text-[var(--color-muted-foreground)]">
                                    {p.salary != null ? fmtM(p.salary) : '—'}
                                  </td>
                                </tr>
                                {editable && open ? (
                                  <tr className="border-b border-[var(--color-border)] last:border-b-0">
                                    <td colSpan={11} className="px-2 py-1.5">
                                      <div className="flex flex-wrap gap-1.5 justify-start">
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
                                        {isToday ? (
                                          <Button
                                            variant={confirmDrop === p.id ? 'danger' : 'quiet'}
                                            onClick={() =>
                                              confirmDrop === p.id ? moveSlot(p.id, 'drop') : setConfirmDrop(p.id)
                                            }
                                            disabled={busy}
                                          >
                                            {confirmDrop === p.id ? `Confirm drop ${p.name.split(' ').pop()}` : 'Drop'}
                                          </Button>
                                        ) : null}
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null
          )}
        </>
      )}

      {/* Draft capital is roster truth too — the picks this team can
          deal or use, three drafts out. */}
      {(team.picks ?? []).length > 0 ? (
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
            Rookie draft picks ({team.picks!.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {[...team.picks!]
              .sort((a, b) => a.seasonYear - b.seasonYear || a.round - b.round)
              .map((pk) => (
                <span
                  key={pk.id}
                  className="text-sm rounded-full px-3 py-1.5 border border-[var(--color-border)] tabular-nums"
                >
                  {pk.seasonYear} Rd {pk.round}
                  {pk.originalTeamId !== team.id ? (
                    <span className="text-[var(--color-accent)]"> via {pk.originalTeamName}</span>
                  ) : null}
                </span>
              ))}
          </div>
          {mine ? (
            <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">
              Picks trade like players — deal them in the Trade Machine.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

// Your team, your look: rename it, give it a logo, add a co-owner.
// The logo is resized in the browser to a small data URL — no file
// storage to configure, and 256px is plenty for a crest.
function TeamSettings({
  leagueId,
  team,
  onSaved,
}: {
  leagueId: string
  team: TeamInfo
  onSaved: () => void
}) {
  const { apiFetch } = useApi()
  const [name, setName] = useState(team.name)
  const [logo, setLogo] = useState<string | null | undefined>(undefined) // undefined = unchanged
  const [coOwner, setCoOwner] = useState('')
  const [saving, setSaving] = useState(false)

  const pickFile = (file: File | null) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const max = 256
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      // WebP keeps transparency small; a browser that can't encode it
      // falls back to PNG.
      let data = canvas.toDataURL('image/webp', 0.85)
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/png')
      if (data.length > 300_000) {
        toast.error('That image is too detailed — try a simpler one.')
        return
      }
      setLogo(data)
    }
    img.onerror = () => toast.error('Could not read that image.')
    img.src = url
  }

  const save = async (body: Record<string, unknown>, okMsg: string) => {
    setSaving(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/teams`, {
        method: 'PATCH',
        body: JSON.stringify({ teamId: team.id, ...body }),
      })
      toast.success(okMsg)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const preview = logo === undefined ? team.logo : logo

  return (
    <div className="mb-5 rounded-lg border border-[var(--color-border-interactive)] bg-mns-card p-4 flex flex-col gap-4 text-sm">
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1.5" htmlFor="team-name">
          Team name
        </label>
        <div className="flex gap-2">
          <input
            id="team-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 min-h-[3rem] rounded-lg bg-[var(--color-background)] border border-[var(--color-border-interactive)] text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <Button onClick={() => save({ name }, 'Team renamed')} disabled={saving || !name.trim() || name.trim() === team.name}>
            Save
          </Button>
        </div>
      </div>

      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1.5">
          Logo
        </span>
        <div className="flex items-center gap-3">
          {preview ? (
            <img src={preview} alt="Team logo preview" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <span className="w-16 h-16 rounded-full border border-dashed border-[var(--color-border-interactive)] flex items-center justify-center text-xs text-[var(--color-muted-foreground)]">
              none
            </span>
          )}
          <label className="inline-flex items-center px-4 min-h-[3rem] rounded-lg border border-[var(--color-border-interactive)] cursor-pointer font-semibold">
            Choose image
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {logo !== undefined ? (
            <Button onClick={() => save({ logo }, 'Logo saved')} disabled={saving}>
              Save logo
            </Button>
          ) : team.logo ? (
            <Button variant="quiet" onClick={() => save({ logo: null }, 'Logo removed')} disabled={saving}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1.5" htmlFor="co-owner">
          Add a co-owner
        </label>
        <div className="flex gap-2">
          <input
            id="co-owner"
            type="email"
            value={coOwner}
            placeholder="their@email.com"
            onChange={(e) => setCoOwner(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 min-h-[3rem] rounded-lg bg-[var(--color-background)] border border-[var(--color-border-interactive)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <Button
            onClick={() => { save({ addOwnerEmail: coOwner.trim() }, 'Co-owner invited'); setCoOwner('') }}
            disabled={saving || !coOwner.includes('@')}
          >
            Invite
          </Button>
        </div>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          They get an email; signing in with that address links them to this team.
        </p>
      </div>
    </div>
  )
}
