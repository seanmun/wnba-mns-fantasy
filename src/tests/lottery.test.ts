import { describe, it, expect } from 'vitest'
import { runLottery, defaultLotteryOdds } from '../rules/lottery'

describe('runLottery', () => {
  it('is deterministic for a given seed', () => {
    const entries = [
      { teamId: 't1', odds: 25 },
      { teamId: 't2', odds: 20 },
      { teamId: 't3', odds: 15 },
      { teamId: 't4', odds: 10 },
    ]
    const a = runLottery({ entries, seed: 12345 })
    const b = runLottery({ entries, seed: 12345 })
    expect(a).toEqual(b)
  })

  it('produces different orders for different seeds', () => {
    const entries = [
      { teamId: 't1', odds: 25 },
      { teamId: 't2', odds: 20 },
      { teamId: 't3', odds: 15 },
      { teamId: 't4', odds: 10 },
      { teamId: 't5', odds: 5 },
    ]
    const a = runLottery({ entries, seed: 1 })
    const b = runLottery({ entries, seed: 99999 })
    // Vanishingly unlikely to match across two unrelated seeds with 5 entries
    expect(a).not.toEqual(b)
  })

  it('includes every team exactly once', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      teamId: `t${i}`,
      odds: 10 - i,
    }))
    const result = runLottery({ entries, seed: 42 })
    expect(result).toHaveLength(10)
    expect(new Set(result).size).toBe(10)
  })

  it('falls back gracefully when all odds are zero', () => {
    const entries = [
      { teamId: 't1', odds: 0 },
      { teamId: 't2', odds: 0 },
    ]
    const result = runLottery({ entries, seed: 1 })
    expect(result).toEqual(['t1', 't2'])
  })

  it('returns empty for empty input', () => {
    expect(runLottery({ entries: [], seed: 1 })).toEqual([])
  })
})

describe('defaultLotteryOdds', () => {
  it('sums to 100', () => {
    for (const count of [4, 6, 10, 14]) {
      const odds = defaultLotteryOdds(count)
      const total = odds.reduce((s, o) => s + o, 0)
      expect(total).toBeCloseTo(100, 5)
    }
  })

  it('worst team gets highest weight', () => {
    const odds = defaultLotteryOdds(6)
    for (let i = 1; i < odds.length; i++) {
      expect(odds[i - 1]).toBeGreaterThanOrEqual(odds[i])
    }
  })

  it('returns empty for zero or negative team count', () => {
    expect(defaultLotteryOdds(0)).toEqual([])
    expect(defaultLotteryOdds(-1)).toEqual([])
  })
})
