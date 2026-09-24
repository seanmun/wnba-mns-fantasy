import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Button, EmptyState, PageHeader, Skeleton } from '../ui/components'

interface ScoreSide {
  code: string
  name: string
  score: number
}
interface Game {
  id: string
  tip: string
  state: 'pre' | 'in' | 'post'
  detail: string
  home: ScoreSide
  away: ScoreSide
}
interface ScoresPayload {
  date: string
  today: string
  games: Game[]
}
interface BoxPlayer {
  name: string
  min: string
  pts: string
  reb: string
  ast: string
  fg: string
  stl: string
  blk: string
  to: string
}
interface Box {
  id: string
  teams: Array<{ code: string; name: string; players: BoxPlayer[] }>
}

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

// The night's real games, straight off the wire. Refreshes itself
// every 45 seconds while today's board has a game running.
export function LiveScores() {
  const { leagueId = '' } = useParams()
  const { apiFetch } = useApi()
  const [date, setDate] = useState(etToday)
  const [data, setData] = useState<ScoresPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [boxes, setBoxes] = useState<Record<string, Box | null>>({})
  const openRef = useRef<string | null>(null)
  openRef.current = openId

  const loadBox = (eventId: string) =>
    apiFetch<Box>(`/api/scores?event=${eventId}`)
      .then((b) => setBoxes((m) => ({ ...m, [eventId]: b })))
      .catch(() => setBoxes((m) => ({ ...m, [eventId]: null })))

  useEffect(() => {
    let cancelled = false
    const load = () =>
      apiFetch<ScoresPayload>(`/api/scores?date=${date}`)
        .then((d) => {
          if (cancelled) return
          setData(d)
          // Keep an open box as live as the board.
          const open = openRef.current
          if (open && d.games.some((g) => g.id === open && g.state !== 'pre')) void loadBox(open)
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message)
        })
    void load()
    const timer = setInterval(() => {
      if (date === etToday()) void load()
    }, 45000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, date])

  const toggleBox = (g: Game) => {
    if (g.state === 'pre') return
    if (openId === g.id) {
      setOpenId(null)
      return
    }
    setOpenId(g.id)
    if (!boxes[g.id]) void loadBox(g.id)
  }

  const isToday = date === etToday()

  return (
    <div className="mns-page py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}/matchup`}
        backLabel="Matchup"
        eyebrow="Around the league"
        title="Games"
        status={isToday ? 'Live scores update on their own.' : fmtDay(date)}
      />

      <div className="mb-4 flex items-center gap-2">
        <Button variant="quiet" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <div className="flex-1 text-center font-bold">{fmtDay(date)}{isToday ? ' · Today' : ''}</div>
        <Button variant="quiet" aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))}>
          <ChevronRight aria-hidden />
        </Button>
        {!isToday ? (
          <Button variant="quiet" onClick={() => setDate(etToday())}>
            Today
          </Button>
        ) : null}
      </div>

      {error ? (
        <EmptyState title="Scores are unavailable">{error}</EmptyState>
      ) : data == null ? (
        <div className="flex flex-col gap-2">
          <Skeleton h="4.5rem" />
          <Skeleton h="4.5rem" />
          <Skeleton h="4.5rem" />
        </div>
      ) : data.games.length === 0 ? (
        <EmptyState title="No games">Nobody plays this day.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.games.map((g) => {
            const done = g.state === 'post'
            const homeWins = done && g.home.score > g.away.score
            const awayWins = done && g.away.score > g.home.score
            const open = openId === g.id
            const box = boxes[g.id]
            return (
              <li
                key={g.id}
                className="rounded-lg border border-[var(--color-border)] bg-mns-card px-4 py-3"
              >
                <button
                  onClick={() => toggleBox(g)}
                  disabled={g.state === 'pre'}
                  aria-expanded={open}
                  aria-label={`${g.away.code} at ${g.home.code}${g.state === 'pre' ? '' : ' — box score'}`}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span
                      className={
                        g.state === 'in'
                          ? 'font-bold text-[var(--color-accent)]'
                          : 'text-[var(--color-muted-foreground)]'
                      }
                    >
                      {g.state === 'in' ? `LIVE · ${g.detail}` : g.detail}
                    </span>
                    {g.state !== 'pre' ? (
                      <span className="text-[var(--color-muted-foreground)]" aria-hidden>
                        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    ) : null}
                  </div>
                  {(
                    [
                      [g.away, awayWins],
                      [g.home, homeWins],
                    ] as const
                  ).map(([side, wins]) => (
                    <div
                      key={side.code}
                      className={
                        'flex items-center justify-between tabular-nums' +
                        (done && !wins ? ' text-[var(--color-muted-foreground)]' : '')
                      }
                    >
                      <span>
                        <b>{side.code}</b>
                        <span className="ml-2 text-sm">{side.name}</span>
                      </span>
                      <span className={'text-lg' + (wins || g.state === 'in' ? ' font-bold' : '')}>
                        {g.state === 'pre' ? '—' : side.score}
                      </span>
                    </div>
                  ))}
                </button>

                {open ? (
                  box === undefined ? (
                    <div className="mt-3">
                      <Skeleton h="6rem" />
                    </div>
                  ) : box === null ? (
                    <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
                      No box score yet — try again in a minute.
                    </p>
                  ) : (
                    box.teams.map((t) => (
                      <div key={t.code} className="mt-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1">
                          {t.code} · {t.name}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs tabular-nums whitespace-nowrap">
                            <thead>
                              <tr className="text-[var(--color-muted-foreground)]">
                                <th className="text-left font-semibold py-0.5 pr-2">Player</th>
                                {['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG'].map((h) => (
                                  <th key={h} className="text-right font-semibold py-0.5 pl-2">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {t.players.map((pl, i) => (
                                <tr key={i} className="border-t border-[var(--color-border)]">
                                  <td className="py-1 pr-2">{pl.name}</td>
                                  {[pl.min, pl.pts, pl.reb, pl.ast, pl.stl, pl.blk, pl.to, pl.fg].map(
                                    (v, j) => (
                                      <td key={j} className="text-right py-1 pl-2">
                                        {v}
                                      </td>
                                    )
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))
                  )
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
