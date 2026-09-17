import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

  useEffect(() => {
    let cancelled = false
    const load = () =>
      apiFetch<ScoresPayload>(`/api/scores?date=${date}`)
        .then((d) => {
          if (!cancelled) setData(d)
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
  }, [apiFetch, date])

  const isToday = date === etToday()

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
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
            return (
              <li
                key={g.id}
                className="rounded-lg border border-[var(--color-border)] bg-mns-card px-4 py-3"
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
