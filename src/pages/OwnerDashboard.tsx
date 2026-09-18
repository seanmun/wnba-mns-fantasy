import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, EllipsisVertical, X } from 'lucide-react'
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
  const [claim, setClaim] = useState<PendingClaim | null>(null)

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
      setClaim(null)
      return
    }
    apiFetch<{ myClaim: PendingClaim | null }>(`/api/leagues/${leagueId}/waivers`)
      .then((w) => setClaim(w.myClaim))
      .catch(() => setClaim(null))
  }, [apiFetch, leagueId, owned])

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

      {mine && claim ? (
        <div className="mb-4 rounded-lg border border-[var(--color-accent)] bg-mns-card p-3 text-sm">
          <b>Waiver claim in</b> — clears {claim.clearsOn} at 8am ET
          <ol className="mt-1 list-decimal list-inside tabular-nums">
            {claim.addNames.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ol>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            {claim.dropName ? `Dropping ${claim.dropName}` : 'No drop — filling an open spot'} · you
            get the first name still available.
          </p>
          <Link
            to={`/league/${leagueId}/free-agents`}
            className="mt-1 inline-block font-bold text-[var(--color-accent)]"
          >
            Change or withdraw →
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
                        sub={
                          <>
                            {[p.position, p.teamCode, p.salary != null ? fmtM(p.salary) : null]
                              .filter(Boolean)
                              .join(' · ')}
                            {day ? <> — {gameNote(p)}</> : null}
                          </>
                        }
                        end={
                          editable ? (
                            <Button
                              variant="quiet"
                              aria-label={openRow === p.id ? `Close actions for ${p.name}` : `Move ${p.name}`}
                              aria-expanded={openRow === p.id}
                              onClick={() => {
                                setOpenRow(openRow === p.id ? null : p.id)
                                setConfirmDrop(null)
                              }}
                            >
                              {openRow === p.id ? <X aria-hidden /> : <EllipsisVertical aria-hidden />}
                            </Button>
                          ) : p.salary != null ? (
                            <span className="text-[0.9rem] text-[var(--color-muted-foreground)] tabular-nums">
                              ${p.salary.toLocaleString()}
                            </span>
                          ) : undefined
                        }
                      />
                      {editable && openRow === p.id ? (
                        <div className="mt-1.5 mb-1 flex flex-wrap gap-1.5 justify-end">
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
                      ) : null}
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
