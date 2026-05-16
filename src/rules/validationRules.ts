import type { LeagueConfig } from '../types/leagueConfig'
import type { Player } from '../types/player'
import type { RosterEntry } from '../types/roster'

export interface ValidationError {
  type: 'error' | 'warning'
  field: string
  message: string
  playerId?: string
}

// Validate roster decisions against league rules. Surfaces missing
// keeper rounds explicitly when config.keeper.fallbackRound is null —
// no silent fallback to round 13 the way mns/ did.
export function validateRoster(
  entries: RosterEntry[],
  allPlayers: Map<string, Player>,
  config: LeagueConfig
): ValidationError[] {
  const errors: ValidationError[] = []

  const keepers = entries.filter((e) => e.decision === 'KEEP')
  const intStashes = entries.filter((e) => e.decision === 'INT_STASH')

  if (keepers.length > config.roster.maxKeepers) {
    errors.push({
      type: 'error',
      field: 'keepersCount',
      message: `Cannot keep more than ${config.roster.maxKeepers} players. You have ${keepers.length} keepers.`,
    })
  }

  if (!config.roster.intStashAllowed && intStashes.length > 0) {
    errors.push({
      type: 'error',
      field: 'intStashDisabled',
      message: 'International stash is disabled in this league.',
    })
  }

  intStashes.forEach((entry) => {
    const player = allPlayers.get(entry.playerId)
    if (player && !player.intEligible) {
      errors.push({
        type: 'error',
        field: 'intStashEligibility',
        message: `${player.name} is not eligible for international stash.`,
        playerId: player.id,
      })
    }
  })

  keepers.forEach((keeper) => {
    const player = allPlayers.get(keeper.playerId)
    if (keeper.baseRound === undefined && player) {
      errors.push({
        type: 'error',
        field: 'missingBaseRound',
        message: `${player.name} has no keeper round set. Set a round before submitting.`,
        playerId: player.id,
      })
    }
  })

  const roundCounts = new Map<number, number>()
  keepers.forEach((k) => {
    if (k.keeperRound) {
      roundCounts.set(k.keeperRound, (roundCounts.get(k.keeperRound) ?? 0) + 1)
    }
  })
  roundCounts.forEach((count, round) => {
    if (count > 1) {
      errors.push({
        type: 'error',
        field: 'roundCollisions',
        message: `Round ${round} has ${count} keepers. Resolve via the Stacking Assistant.`,
      })
    }
  })

  keepers.forEach((keeper) => {
    const player = allPlayers.get(keeper.playerId)
    if (!keeper.keeperRound && player && keeper.baseRound !== undefined) {
      errors.push({
        type: 'warning',
        field: 'unassignedRound',
        message: `${player.name} is KEEP but has no final keeperRound. Run the Stacking Assistant.`,
        playerId: player.id,
      })
    }
  })

  return errors
}
