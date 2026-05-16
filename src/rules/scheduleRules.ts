import type { LeagueConfig } from '../types/leagueConfig'

export interface GeneratedWeek {
  id: string
  leagueId: string
  seasonYear: number
  weekNumber: number
  matchupWeek: number
  startDate: string
  endDate: string
  isTradeDeadlineWeek: boolean
  label: string | null
}

export interface CombinedWeekConfig {
  calendarWeeks: number[]
  label: string
}

// Generate week rows from a league config + an optional list of
// combined weeks (e.g. NBA Cup knockouts, All-Star break). Each week
// is Monday-Sunday (7 days). Post-season playoff weeks are appended
// after the regular-season count.
export function generateWeeks(params: {
  leagueId: string
  config: LeagueConfig
  combinedWeeks?: CombinedWeekConfig[]
}): GeneratedWeek[] {
  const { leagueId, config, combinedWeeks = [] } = params
  const seasonStart = config.season.startDate
  const numWeeks = config.season.weeks
  const seasonYear = config.season.year
  const tradeDeadlineWeek = config.schedule.tradeDeadlineWeek

  if (!seasonStart) return []

  const combinedMap = new Map<number, { matchupWeek: number; label: string }>()
  for (const cw of combinedWeeks) {
    for (const wn of cw.calendarWeeks) {
      combinedMap.set(wn, {
        matchupWeek: cw.calendarWeeks[0],
        label: cw.label,
      })
    }
  }

  const weeks: GeneratedWeek[] = []
  const start = new Date(seasonStart + 'T00:00:00')

  for (let i = 0; i < numWeeks; i++) {
    const weekNum = i + 1
    const weekStart = new Date(start)
    weekStart.setDate(start.getDate() + i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    const combined = combinedMap.get(weekNum)

    weeks.push({
      id: `${leagueId}_week_${weekNum}`,
      leagueId,
      seasonYear,
      weekNumber: weekNum,
      matchupWeek: combined ? combined.matchupWeek : weekNum,
      startDate: weekStart.toISOString().slice(0, 10),
      endDate: weekEnd.toISOString().slice(0, 10),
      isTradeDeadlineWeek: weekNum === tradeDeadlineWeek,
      label: combined ? combined.label : null,
    })
  }

  const playoffWeeks = config.schedule.playoffWeeks
  const consolationWeeks = config.schedule.consolationWeeks
  if (playoffWeeks > 0 || consolationWeeks > 0) {
    const postSeasonWeeks = Math.max(playoffWeeks, consolationWeeks)
    const playoffLabels = ['Round 1', 'Quarterfinals', 'Semifinals', 'Finals']
    const labels = playoffLabels.slice(
      Math.max(0, playoffLabels.length - playoffWeeks)
    )

    for (let p = 0; p < postSeasonWeeks; p++) {
      const weekNum = numWeeks + p + 1
      const weekStart = new Date(start)
      weekStart.setDate(start.getDate() + (numWeeks + p) * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)

      const isPlayoffWeek = p < playoffWeeks
      let label: string
      if (isPlayoffWeek) {
        label = labels[p] ?? 'Playoffs'
      } else {
        label = 'Consolation'
      }

      weeks.push({
        id: `${leagueId}_week_${weekNum}`,
        leagueId,
        seasonYear,
        weekNumber: weekNum,
        matchupWeek: weekNum,
        startDate: weekStart.toISOString().slice(0, 10),
        endDate: weekEnd.toISOString().slice(0, 10),
        isTradeDeadlineWeek: false,
        label,
      })
    }
  }

  return weeks
}

export function getCurrentWeek(
  weeks: GeneratedWeek[],
  today: Date = new Date()
): number | null {
  if (weeks.length === 0) return null
  const todayStr = today.toISOString().slice(0, 10)

  for (const week of weeks) {
    if (todayStr >= week.startDate && todayStr <= week.endDate) {
      return week.weekNumber
    }
  }

  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (todayStr < first.startDate) return null
  if (todayStr > last.endDate) return last.weekNumber
  return null
}

export function formatCountdown(
  targetDate: string,
  now: Date = new Date()
): string {
  const todayStr =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0')

  if (targetDate < todayStr) return 'Passed'
  if (targetDate === todayStr) return 'Today'

  const target = new Date(targetDate + 'T00:00:00')
  const today = new Date(todayStr + 'T00:00:00')
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000
  )

  if (diffDays === 1) return '1 day'
  if (diffDays < 7) return `${diffDays} days`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return weeks === 1 ? '1 week' : `${weeks} weeks`
  }
  const months = Math.floor(diffDays / 30)
  return months === 1 ? '1 month' : `${months} months`
}

export function computePlayoffDefaults(playoffTeams: number): {
  weeks: number
  byes: number
} {
  if (playoffTeams <= 1) return { weeks: 0, byes: 0 }
  const weeks = Math.ceil(Math.log2(playoffTeams))
  const bracketSize = Math.pow(2, weeks)
  const byes = bracketSize - playoffTeams
  return { weeks, byes }
}
