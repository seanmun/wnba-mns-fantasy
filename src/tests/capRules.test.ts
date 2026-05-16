import { describe, it, expect } from 'vitest'
import { computeApronFees } from '../rules/capRules'
import { WNBA_LEAGUE_PRESET } from '../lib/presets/wnba'

const withAprons = {
  ...WNBA_LEAGUE_PRESET,
  cap: {
    ...WNBA_LEAGUE_PRESET.cap,
    firstApron: 1_200_000,
    secondApron: 1_400_000,
    penaltyRatePerM: 2,
  },
  fees: { ...WNBA_LEAGUE_PRESET.fees, firstApronFee: 50 },
}

describe('computeApronFees', () => {
  it('charges first apron once when crossed', () => {
    const result = computeApronFees({
      capUsed: 1_300_000,
      config: withAprons,
      current: { firstApronFee: 0, secondApronPenalty: 0 },
    })
    expect(result.firstApronFee).toBe(50)
    expect(result.firstApronTriggered).toBe(true)
  })

  it('keeps first apron sticky once already charged', () => {
    const result = computeApronFees({
      capUsed: 800_000,
      config: withAprons,
      current: { firstApronFee: 50, secondApronPenalty: 0 },
    })
    expect(result.firstApronFee).toBe(50)
    expect(result.firstApronTriggered).toBe(false)
  })

  it('does not charge first apron when under threshold', () => {
    const result = computeApronFees({
      capUsed: 1_100_000,
      config: withAprons,
      current: { firstApronFee: 0, secondApronPenalty: 0 },
    })
    expect(result.firstApronFee).toBe(0)
  })

  it('raises second apron penalty when peak grows', () => {
    const result = computeApronFees({
      capUsed: 1_600_000,
      config: withAprons,
      current: { firstApronFee: 0, secondApronPenalty: 0 },
    })
    // 1.6M - 1.4M = 200K → ceil(200K/1M) = 1 → 1 * $2 = $2
    expect(result.secondApronPenalty).toBe(2)
    expect(result.secondApronWatermarkRaised).toBe(true)
  })

  it('holds the watermark when cap drops', () => {
    const result = computeApronFees({
      capUsed: 1_300_000,
      config: withAprons,
      current: { firstApronFee: 50, secondApronPenalty: 10 },
    })
    expect(result.secondApronPenalty).toBe(10)
    expect(result.secondApronWatermarkRaised).toBe(false)
  })

  it('charges nothing when aprons are disabled (WNBA preset)', () => {
    const result = computeApronFees({
      capUsed: 5_000_000,
      config: WNBA_LEAGUE_PRESET,
      current: { firstApronFee: 0, secondApronPenalty: 0 },
    })
    expect(result.firstApronFee).toBe(0)
    expect(result.secondApronPenalty).toBe(0)
  })
})
