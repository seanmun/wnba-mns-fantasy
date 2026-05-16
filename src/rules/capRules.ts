import type { LeagueConfig } from '../types/leagueConfig'

export interface CurrentFees {
  firstApronFee: number
  secondApronPenalty: number
}

export interface ComputedApronFees {
  firstApronFee: number
  secondApronPenalty: number
  firstApronTriggered: boolean
  secondApronWatermarkRaised: boolean
}

// Compute apron fees with the two mns/ business rules baked in:
//
//   first apron  — STICKY. Once charged in a season, stays charged
//                  even if cap drops below the threshold later.
//   second apron — WATERMARK. Tracks the peak penalty during the
//                  season; never decreases even if cap drops.
//
// Caller passes the current persisted fee state; this returns the new
// state. Both flags say whether anything *changed* — useful for fee
// transaction logging.
export function computeApronFees(params: {
  capUsed: number
  config: LeagueConfig
  current: CurrentFees
}): ComputedApronFees {
  const { capUsed, config, current } = params

  let firstApronFee = current.firstApronFee
  let firstApronTriggered = false
  if (
    firstApronFee === 0 &&
    config.cap.firstApron > 0 &&
    capUsed > config.cap.firstApron
  ) {
    firstApronFee = config.fees.firstApronFee
    firstApronTriggered = true
  }

  let secondApronPenalty = current.secondApronPenalty
  let secondApronWatermarkRaised = false
  if (config.cap.secondApron > 0 && capUsed > config.cap.secondApron) {
    const overByM = Math.ceil(
      (capUsed - config.cap.secondApron) / 1_000_000
    )
    const newPenalty = overByM * config.cap.penaltyRatePerM
    if (newPenalty > secondApronPenalty) {
      secondApronPenalty = newPenalty
      secondApronWatermarkRaised = true
    }
  }

  return {
    firstApronFee,
    secondApronPenalty,
    firstApronTriggered,
    secondApronWatermarkRaised,
  }
}
