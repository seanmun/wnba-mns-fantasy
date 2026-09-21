import { describe, expect, it } from 'vitest'
import { firstRoundPairings, nextRoundPairings, roundLabel } from '../lib/season/playoffs'

const seed = (n: number) => ({ teamId: `t${n}`, seed: n })

describe('firstRoundPairings', () => {
  it('two teams, no byes: straight to a final, 1 hosts 2', () => {
    const { round, byesTo } = firstRoundPairings([seed(1), seed(2)], 0)
    expect(byesTo).toEqual([])
    expect(round).toEqual([{ home: seed(1), away: seed(2) }])
  })

  it('four teams: 1v4 and 2v3, better seed hosts', () => {
    const { round } = firstRoundPairings([1, 2, 3, 4].map(seed), 0)
    expect(round).toEqual([
      { home: seed(1), away: seed(4) },
      { home: seed(2), away: seed(3) },
    ])
  })

  it('six teams with two byes: top two sit, 3v6 and 4v5 play', () => {
    const { round, byesTo } = firstRoundPairings([1, 2, 3, 4, 5, 6].map(seed), 2)
    expect(byesTo).toEqual([seed(1), seed(2)])
    expect(round).toEqual([
      { home: seed(3), away: seed(6) },
      { home: seed(4), away: seed(5) },
    ])
  })
})

describe('nextRoundPairings', () => {
  it('byes rejoin and the best surviving seed hosts the worst', () => {
    // Byes 1,2; winners from round one were seeds 3 and 5.
    const round = nextRoundPairings([seed(5), seed(3)], [seed(1), seed(2)])
    expect(round).toEqual([
      { home: seed(1), away: seed(5) },
      { home: seed(2), away: seed(3) },
    ])
  })

  it('two survivors make the final', () => {
    const round = nextRoundPairings([seed(4), seed(2)])
    expect(round).toEqual([{ home: seed(2), away: seed(4) }])
  })
})

describe('roundLabel', () => {
  it('names rounds by field size', () => {
    expect(roundLabel(2)).toBe('Championship')
    expect(roundLabel(4)).toBe('Semifinal')
    expect(roundLabel(8)).toBe('Quarterfinal')
    expect(roundLabel(16)).toBe('Round of 16')
  })
})
