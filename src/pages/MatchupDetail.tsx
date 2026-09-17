import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useApi } from '../hooks/useApi'
import { EmptyState, PageHeader, Skeleton } from '../ui/components'

interface WeekTotals {
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tpm: number
  games: number
}
interface SidePlayer {
  id: string
  name: string
  position: string | null
  teamCode: string | null
  week: WeekTotals | null
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
interface MatchupPayload {
  matchup: {
    id: string
    matchupWeek: number
    status: string
    homeTeamId: string
    awayTeamId: string
    homeTeamName: string
    awayTeamName: string
    homeScore: number
    awayScore: number
    startDate: string
    endDate: string
    result: {
      categories?: string[]
      home?: Record<string, number>
      away?: Record<string, number>
    } | null
  }
  home: SidePlayer[]
  away: SidePlayer[]
  day: {
    date: string
    today: string
    games: Record<string, DayGame>
    slots: Record<string, string>
    lines: Record<string, DayLine>
  }
}

const fmtCat = (cat: string, v: number | undefined) =>
  v == null ? '—' : cat.includes('%') ? (v * 100).toFixed(1) : cat === 'A/TO' ? v.toFixed(2) : String(Math.round(v))

const shiftDate = (date: string, days: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)
const datesBetween = (start: string, end: string) => {
  const out: string[] = []
  for (let d = start; d <= end && out.length < 14; d = shiftDate(d, 1)) out.push(d)
  return out
}
const fmtChip = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtTip = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })

// One matchup: who's winning which categories, and the week each
// player actually had. Category math mirrors the scorer exactly —
// this page only displays what the scoring pass stored.
export function MatchupDetail() {
  const { leagueId = '', matchupId = '' } = useParams()
  const { user } = useUser()
  const { apiFetch } = useApi()
  const [data, setData] = useState<MatchupPayload | null>(null)
  const [myTeamId, setMyTeamId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selDate, setSelDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        let id = matchupId
        // Teams are always fetched: the page orients itself so the
        // VIEWER'S team sits on the left, whoever they are.
        const teams = await apiFetch<Array<{ id: string; owners: Array<{ userId: string | null }> }>>(
          `/api/leagues/${leagueId}/teams`
        )
        const myTeam = teams.find((t) => t.owners.some((o) => o.userId === user?.id))
        if (!cancelled) setMyTeamId(myTeam?.id ?? null)
        // The Matchup tab arrives with no id: resolve to MY current
        // matchup (the week's first if the caller owns no team).
        if (!id) {
          const week = await apiFetch<{ matchups: Array<{ id: string; homeTeamId: string; awayTeamId: string }> }>(
            `/api/leagues/${leagueId}/matchups`
          )
          const mineOrFirst =
            week.matchups.find(
              (m) => myTeam && (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id)
            ) ?? week.matchups[0]
          if (!mineOrFirst) {
            if (!cancelled) setError('No matchups yet — the season may not have started.')
            return
          }
          id = mineOrFirst.id
        }
        const d = await apiFetch<MatchupPayload>(
          `/api/leagues/${leagueId}/matchups?matchupId=${id}${selDate ? `&date=${selDate}` : ''}`
        )
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId, matchupId, user?.id, selDate])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="60%" />
        <Skeleton h="8rem" />
      </div>
    )
  }

  const { matchup, home, away, day } = data
  const cats = matchup.result?.categories ?? []
  const weekDays = datesBetween(matchup.startDate, matchup.endDate)

  // One player's chosen day: their game (or not), and the line once
  // it exists — the same language as My Team.
  const dayNote = (p: SidePlayer) => {
    const g = p.teamCode ? day.games[p.teamCode] : undefined
    const line = day.lines[p.id]
    if (line && (line.min > 0 || g?.state !== 'pre')) {
      return (
        <span className="text-[var(--color-accent)]">
          {line.pts}p {line.reb}r {line.ast}a · {line.min} min
        </span>
      )
    }
    if (!g) return <span className="text-[var(--color-muted-foreground)]">no game</span>
    return (
      <span>
        {g.home ? 'vs' : '@'} {g.opp}
        {g.state === 'pre' ? ` · ${fmtTip(g.tip)}` : g.state === 'in' ? ' · live' : ' · final'}
      </span>
    )
  }

  // The viewer's team owns the LEFT column; a neutral viewer gets
  // away-at-home reading order.
  const meIsHome = myTeamId === matchup.homeTeamId
  const left = meIsHome
    ? { name: matchup.homeTeamName, score: matchup.homeScore, vals: matchup.result?.home, side: home }
    : { name: matchup.awayTeamName, score: matchup.awayScore, vals: matchup.result?.away, side: away }
  const right = meIsHome
    ? { name: matchup.awayTeamName, score: matchup.awayScore, vals: matchup.result?.away, side: away }
    : { name: matchup.homeTeamName, score: matchup.homeScore, vals: matchup.result?.home, side: home }

  return (
    <div className="max-w-3xl mx-auto px-4 py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        eyebrow={`Week ${matchup.matchupWeek} · ${matchup.status === 'final' ? 'Final' : matchup.status === 'live' ? 'Live' : 'Scheduled'}`}
        title={
          <span className="tabular-nums">
            {left.name} {left.score} — {right.score} {right.name}
          </span>
        }
        status={`Category score · ${matchup.startDate} to ${matchup.endDate}`}
      />

      {cats.length > 0 && (
        <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-mns-card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] px-4 py-2 border-b border-[var(--color-border)]">
            <span className="truncate">
              {left.name}
              {myTeamId === matchup.homeTeamId || myTeamId === matchup.awayTeamId ? ' (you)' : ''}
            </span>
            <span className="px-3 text-center">Cat</span>
            <span className="truncate text-right">{right.name}</span>
          </div>
          {cats.map((c) => {
            const lv = left.vals?.[c]
            const rv = right.vals?.[c]
            const lWins = (lv ?? 0) > (rv ?? 0)
            const rWins = (rv ?? 0) > (lv ?? 0)
            return (
              <div key={c} className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-1.5 border-b border-[var(--color-border)] last:border-b-0 tabular-nums text-sm">
                <span className={lWins ? 'text-[var(--color-accent)] font-bold' : ''}>{fmtCat(c, lv)}</span>
                <span className="px-3 text-center text-xs font-semibold text-[var(--color-muted-foreground)]">{c}</span>
                <span className={'text-right ' + (rWins ? 'text-[var(--color-accent)] font-bold' : '')}>{fmtCat(c, rv)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* The week, one day at a time — who suits up on each date. */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {weekDays.map((d) => (
          <button
            key={d}
            onClick={() => setSelDate(d)}
            aria-pressed={d === day.date}
            className={
              'shrink-0 rounded-lg px-3 py-1.5 min-h-[2.75rem] border text-sm tabular-nums ' +
              (d === day.date
                ? 'border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
                : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]') +
              (d === day.today ? ' underline underline-offset-4' : '')
            }
          >
            {fmtChip(d)}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {(
          [
            [left.name, left.side],
            [right.name, right.side],
          ] as const
        ).map(([label, side]) => (
          <section key={label}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
              {label}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {side.map((p) => {
                const slot = day.slots[p.id] ?? 'active'
                return (
                  <li
                    key={p.id}
                    className={
                      'rounded-lg border border-[var(--color-border)] bg-mns-card px-3 py-2' +
                      (slot !== 'active' ? ' opacity-60' : '')
                    }
                  >
                    <span className="block font-semibold text-sm">
                      {p.name}
                      <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">
                        {[p.position, p.teamCode].filter(Boolean).join(' · ')}
                      </span>
                      {slot !== 'active' ? (
                        <span className="ml-1.5 text-[0.65rem] uppercase tracking-wider rounded px-1 py-0.5 border border-[var(--color-border)] text-[var(--color-muted-foreground)]">
                          {slot === 'ir' ? 'IR' : 'Bench'}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs tabular-nums">{dayNote(p)}</span>
                    <span className="block text-xs text-[var(--color-muted-foreground)] tabular-nums">
                      {p.week
                        ? `week: ${p.week.games} gm · ${p.week.pts} pts · ${p.week.reb} reb · ${p.week.ast} ast · ${p.week.stl} stl · ${p.week.blk} blk`
                        : 'no games yet'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
