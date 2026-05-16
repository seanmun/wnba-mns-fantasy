import { describe, it, expect } from 'vitest'
import { computePrizePool } from '../rules/prizePoolRules'
import { WNBA_LEAGUE_PRESET } from '../lib/presets/wnba'

describe('computePrizePool', () => {
  it('Boiler Room <$300: 100% to 1st', () => {
    const result = computePrizePool({
      totalPool: 200,
      totalCollected: 500,
      config: WNBA_LEAGUE_PRESET,
    })
    expect(result.zone).toBe('boilerRoom')
    expect(result.payouts).toHaveLength(1)
    expect(result.payouts[0].amount).toBe(200)
    expect(result.payouts[0].percentage).toBe(100)
  })

  it('Boiler Room ≥$300: 80/20 split', () => {
    const result = computePrizePool({
      totalPool: 400,
      totalCollected: 500,
      config: WNBA_LEAGUE_PRESET,
    })
    expect(result.zone).toBe('boilerRoom')
    expect(result.payouts).toHaveLength(2)
    expect(result.payouts[0].amount).toBe(400 * 0.8)
    expect(result.payouts[1].amount).toBe(400 * 0.2)
  })

  it('Gordon Gekko: 70/20/10 split when pool grew', () => {
    const result = computePrizePool({
      totalPool: 1000,
      totalCollected: 500,
      config: WNBA_LEAGUE_PRESET,
    })
    expect(result.zone).toBe('gordonGekko')
    expect(result.payouts).toHaveLength(3)
    expect(result.payouts[0].amount).toBe(700)
    expect(result.payouts[1].amount).toBe(200)
    expect(result.payouts[2].amount).toBe(100)
  })

  it('Bernie Zone: top 3 + 4% each for rest when pool ≥$10K', () => {
    const result = computePrizePool({
      totalPool: 20_000,
      totalCollected: 500,
      config: WNBA_LEAGUE_PRESET,
    })
    expect(result.zone).toBe('bernie')
    expect(result.payouts[0].percentage).toBe(40)
    expect(result.payouts[1].percentage).toBe(15)
    expect(result.payouts[2].percentage).toBe(9)
    // Remaining 9 entries are 4% each
    expect(result.payouts.slice(3).every((p) => p.percentage === 4)).toBe(true)
  })

  it('honors a custom Boiler Room threshold from config', () => {
    const config = {
      ...WNBA_LEAGUE_PRESET,
      prizePool: {
        ...WNBA_LEAGUE_PRESET.prizePool,
        zones: { ...WNBA_LEAGUE_PRESET.prizePool.zones, boilerThreshold: 100 },
      },
    }
    const result = computePrizePool({
      totalPool: 200,
      totalCollected: 500,
      config,
    })
    expect(result.payouts).toHaveLength(2)
  })
})
