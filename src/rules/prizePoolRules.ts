import type { LeagueConfig } from '../types/leagueConfig'

export type PrizePoolZone = 'boilerRoom' | 'gordonGekko' | 'bernie'

export interface PrizePayoutEntry {
  place: string
  percentage: number
  amount: number
  note?: string
}

export interface PrizePool {
  zone: PrizePoolZone
  zoneName: string
  zoneDescription: string
  payouts: PrizePayoutEntry[]
}

// Compute prize-pool zone + payouts from current pool value vs initial
// collected. Three zones, all thresholds configurable per league:
//
//   Boiler Room   pool < collected (declined)
//     <$300       100% to 1st
//     otherwise   80/20 1st/2nd (configurable via boilerSmallSplit)
//
//   Bernie        pool >= bernieThreshold (default $10K)
//     bernieSplit: e.g. [40, 15, 9, 4×N] — top 3 + rest
//
//   Gordon Gekko  default growth case
//     gekkoSplit: [first, second, third] — typically 70/20/10
export function computePrizePool(params: {
  totalPool: number
  totalCollected: number
  config: LeagueConfig
}): PrizePool {
  const { totalPool, totalCollected, config } = params
  const zones = config.prizePool.zones

  if (totalPool < totalCollected) {
    if (totalPool < zones.boilerThreshold) {
      return {
        zone: 'boilerRoom',
        zoneName: 'Boiler Room Zone',
        zoneDescription: `Prize pool below $${zones.boilerThreshold}`,
        payouts: [{ place: '1st', percentage: 100, amount: totalPool }],
      }
    }
    const [a, b] = zones.boilerSmallSplit
    return {
      zone: 'boilerRoom',
      zoneName: 'Boiler Room Zone',
      zoneDescription: 'Prize pool declined below initial investment',
      payouts: [
        { place: '1st', percentage: a, amount: (totalPool * a) / 100 },
        { place: '2nd', percentage: b, amount: (totalPool * b) / 100 },
      ],
    }
  }

  if (totalPool >= zones.bernieThreshold) {
    const splits = zones.bernieSplit
    const payouts: PrizePayoutEntry[] = splits.map((pct, idx) => ({
      place: ordinalPlace(idx + 1),
      percentage: pct,
      amount: (totalPool * pct) / 100,
    }))
    return {
      zone: 'bernie',
      zoneName: 'Bernie Zone',
      zoneDescription: `Prize pool $${zones.bernieThreshold}+`,
      payouts,
    }
  }

  const [first, second, third] = zones.gekkoSplit
  return {
    zone: 'gordonGekko',
    zoneName: 'Gordon Gekko Zone',
    zoneDescription: 'Prize pool grew above initial investment',
    payouts: [
      { place: '1st', percentage: first, amount: (totalPool * first) / 100 },
      { place: '2nd', percentage: second, amount: (totalPool * second) / 100 },
      { place: '3rd', percentage: third, amount: (totalPool * third) / 100 },
    ],
  }
}

function ordinalPlace(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}
