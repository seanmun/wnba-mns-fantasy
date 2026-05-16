import { describe, it, expect } from 'vitest'
import { lookupRookieKeeperRound } from '../rules/rookieKeeperMap'
import { WNBA_LEAGUE_PRESET } from '../lib/presets/wnba'

describe('lookupRookieKeeperRound', () => {
  it('matches a range key (1.1-1.3)', () => {
    expect(lookupRookieKeeperRound(1, 1, WNBA_LEAGUE_PRESET)).toBe(4)
    expect(lookupRookieKeeperRound(1, 2, WNBA_LEAGUE_PRESET)).toBe(4)
    expect(lookupRookieKeeperRound(1, 3, WNBA_LEAGUE_PRESET)).toBe(4)
  })

  it('matches a different range key (1.4-1.6)', () => {
    expect(lookupRookieKeeperRound(1, 4, WNBA_LEAGUE_PRESET)).toBe(5)
    expect(lookupRookieKeeperRound(1, 5, WNBA_LEAGUE_PRESET)).toBe(5)
    expect(lookupRookieKeeperRound(1, 6, WNBA_LEAGUE_PRESET)).toBe(5)
  })

  it('matches a wildcard key (2.x)', () => {
    expect(lookupRookieKeeperRound(2, 1, WNBA_LEAGUE_PRESET)).toBe(10)
    expect(lookupRookieKeeperRound(2, 7, WNBA_LEAGUE_PRESET)).toBe(10)
  })

  it('matches exact key form', () => {
    const config = {
      ...WNBA_LEAGUE_PRESET,
      keeper: { ...WNBA_LEAGUE_PRESET.keeper, rookieRoundMap: { '1.5': 9 } },
    }
    expect(lookupRookieKeeperRound(1, 5, config)).toBe(9)
    expect(lookupRookieKeeperRound(1, 6, config)).toBeNull()
  })

  it('returns null for unmapped pick', () => {
    const config = {
      ...WNBA_LEAGUE_PRESET,
      keeper: { ...WNBA_LEAGUE_PRESET.keeper, rookieRoundMap: { '1.1-1.3': 4 } },
    }
    expect(lookupRookieKeeperRound(2, 1, config)).toBeNull()
    expect(lookupRookieKeeperRound(5, 1, config)).toBeNull()
  })

  it('does not match across rounds even if pick is in range', () => {
    expect(lookupRookieKeeperRound(2, 2, WNBA_LEAGUE_PRESET)).toBe(10)
    // 2.x catches all picks in round 2, so 2,2 hits 10 not the round-1 range
  })
})
