import { describe, it, expect } from 'vitest'
import { computeMatchupResult } from '../rules/scoringRules'
import { WNBA_LEAGUE_PRESET } from '../lib/presets/wnba'

const cats = WNBA_LEAGUE_PRESET.scoring.categories

describe('computeMatchupResult', () => {
  it('counts category-by-category W/L/T in category_record mode', () => {
    const home = Object.fromEntries(cats.map((c, i) => [c, i + 1]))
    const away = Object.fromEntries(cats.map((c, i) => [c, i + 1])) // all tied
    const result = computeMatchupResult(home, away, WNBA_LEAGUE_PRESET)
    expect(result.ties).toBe(cats.length)
    expect(result.homeRecord.ties).toBe(cats.length)
  })

  it('home wins majority of categories', () => {
    const home = Object.fromEntries(cats.map((c) => [c, 10]))
    const away = Object.fromEntries(cats.map((c) => [c, 5]))
    const result = computeMatchupResult(home, away, WNBA_LEAGUE_PRESET)
    expect(result.homeCategoryWins).toBe(cats.length)
    expect(result.awayCategoryWins).toBe(0)
    expect(result.homeRecord.wins).toBe(cats.length)
    expect(result.awayRecord.losses).toBe(cats.length)
  })

  it('matchup_record mode awards a single W to majority winner', () => {
    const config = {
      ...WNBA_LEAGUE_PRESET,
      scoring: { ...WNBA_LEAGUE_PRESET.scoring, mode: 'matchup_record' as const },
    }
    const home: Record<string, number> = {}
    const away: Record<string, number> = {}
    // Home wins 5, away wins 4
    cats.forEach((c, i) => {
      home[c] = i < 5 ? 10 : 1
      away[c] = i < 5 ? 1 : 10
    })
    const result = computeMatchupResult(home, away, config)
    expect(result.homeRecord).toEqual({ wins: 1, losses: 0, ties: 0 })
    expect(result.awayRecord).toEqual({ wins: 0, losses: 1, ties: 0 })
  })

  it('matchup_record tie when category wins are equal', () => {
    const config = {
      ...WNBA_LEAGUE_PRESET,
      scoring: { ...WNBA_LEAGUE_PRESET.scoring, mode: 'matchup_record' as const },
      // override to even-length categories list so we can split 50/50
    }
    const home: Record<string, number> = {}
    const away: Record<string, number> = {}
    const half = Math.floor(cats.length / 2)
    cats.forEach((c, i) => {
      home[c] = i < half ? 10 : 1
      away[c] = i < half ? 1 : 10
    })
    if (cats.length % 2 === 1) {
      // Force a tie on the middle cat
      home[cats[half]] = 5
      away[cats[half]] = 5
    }
    const result = computeMatchupResult(home, away, config)
    expect(result.homeCategoryWins).toBe(half)
    expect(result.awayCategoryWins).toBe(half)
  })

  it('defaults missing stats to 0', () => {
    const result = computeMatchupResult({ PTS: 100 }, { REB: 50 }, WNBA_LEAGUE_PRESET)
    // PTS: home 100 > away 0 → home win
    // REB: home 0 < away 50 → away win
    // Other 7 cats: 0 vs 0 → ties
    expect(result.homeCategoryWins).toBe(1)
    expect(result.awayCategoryWins).toBe(1)
    expect(result.ties).toBe(cats.length - 2)
  })
})
