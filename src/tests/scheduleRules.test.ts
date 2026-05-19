import { describe, it, expect } from 'vitest'
import {
  generateWeeks,
  getCurrentWeek,
  formatCountdown,
  computePlayoffDefaults,
} from '../rules/scheduleRules'
import { WNBA_LEAGUE_PRESET } from '../lib/presets/wnba'

describe('generateWeeks', () => {
  it('produces config.season.weeks regular-season weeks', () => {
    const weeks = generateWeeks({
      leagueId: 'mns-w-2026',
      config: WNBA_LEAGUE_PRESET,
    })
    // 13 reg + 3 playoff weeks = 16 (no consolation per preset)
    expect(weeks.length).toBeGreaterThanOrEqual(13)
  })

  it('flags the trade deadline week', () => {
    const weeks = generateWeeks({
      leagueId: 'l',
      config: WNBA_LEAGUE_PRESET,
    })
    const deadline = weeks.find((w) => w.isTradeDeadlineWeek)
    expect(deadline?.weekNumber).toBe(9)
  })

  it('appends playoff weeks with labels', () => {
    const weeks = generateWeeks({
      leagueId: 'l',
      config: WNBA_LEAGUE_PRESET,
    })
    const playoff = weeks.filter((w) => w.label === 'Finals' || w.label === 'Semifinals' || w.label === 'Quarterfinals')
    expect(playoff.length).toBeGreaterThan(0)
  })

  it('collapses combined weeks to a single matchupWeek', () => {
    const weeks = generateWeeks({
      leagueId: 'l',
      config: WNBA_LEAGUE_PRESET,
      combinedWeeks: [{ calendarWeeks: [6, 7], label: 'All-Star' }],
    })
    const w6 = weeks.find((w) => w.weekNumber === 6)!
    const w7 = weeks.find((w) => w.weekNumber === 7)!
    expect(w6.matchupWeek).toBe(6)
    expect(w7.matchupWeek).toBe(6)
    expect(w7.label).toBe('All-Star')
  })

  it('returns empty when seasonStartDate is empty', () => {
    const config = { ...WNBA_LEAGUE_PRESET, season: { ...WNBA_LEAGUE_PRESET.season, startDate: '' } }
    expect(generateWeeks({ leagueId: 'l', config })).toEqual([])
  })
})

describe('getCurrentWeek', () => {
  const weeks = generateWeeks({
    leagueId: 'l',
    config: WNBA_LEAGUE_PRESET,
  })

  it('returns null before season starts', () => {
    expect(getCurrentWeek(weeks, new Date('2026-01-01'))).toBeNull()
  })

  it('returns the current week during the season', () => {
    expect(getCurrentWeek(weeks, new Date('2026-05-12'))).toBe(1)
  })

  it('returns last week after season ends', () => {
    const result = getCurrentWeek(weeks, new Date('2030-01-01'))
    expect(result).toBeGreaterThanOrEqual(13)
  })
})

describe('formatCountdown', () => {
  it('returns "Today" for same-day target', () => {
    const today = new Date('2026-05-15T12:00:00')
    expect(formatCountdown('2026-05-15', today)).toBe('Today')
  })

  it('returns "1 day" for next-day target', () => {
    expect(formatCountdown('2026-05-16', new Date('2026-05-15T00:00:00'))).toBe('1 day')
  })

  it('returns "Passed" for past target', () => {
    expect(formatCountdown('2026-01-01', new Date('2026-05-15'))).toBe('Passed')
  })

  it('returns weeks for ranges 7-29 days', () => {
    expect(formatCountdown('2026-05-22', new Date('2026-05-15T00:00:00'))).toBe('1 week')
  })

  it('returns months for 30+ days', () => {
    const result = formatCountdown('2026-08-15', new Date('2026-05-15T00:00:00'))
    expect(result).toMatch(/month/)
  })
})

describe('computePlayoffDefaults', () => {
  it('6 teams → 3 weeks, 2 byes', () => {
    expect(computePlayoffDefaults(6)).toEqual({ weeks: 3, byes: 2 })
  })

  it('4 teams → 2 weeks, 0 byes', () => {
    expect(computePlayoffDefaults(4)).toEqual({ weeks: 2, byes: 0 })
  })

  it('8 teams → 3 weeks, 0 byes', () => {
    expect(computePlayoffDefaults(8)).toEqual({ weeks: 3, byes: 0 })
  })

  it('1 team → 0 weeks, 0 byes', () => {
    expect(computePlayoffDefaults(1)).toEqual({ weeks: 0, byes: 0 })
  })
})
