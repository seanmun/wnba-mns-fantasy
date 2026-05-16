import type { LeagueConfig } from '../types/leagueConfig'

// Lookup keeper round for a rookie pick from config.keeper.rookieRoundMap.
// Supports three key formats:
//   "1.3"     — exact pick (round 1, pick 3)
//   "1.1-1.3" — range within a round
//   "2.x"     — wildcard for any pick in the round
export function lookupRookieKeeperRound(
  round: number,
  pick: number,
  config: LeagueConfig
): number | null {
  const map = config.keeper.rookieRoundMap

  for (const [key, value] of Object.entries(map)) {
    if (matchesKey(key, round, pick)) return value
  }

  return null
}

function matchesKey(key: string, round: number, pick: number): boolean {
  const range = key.match(/^(\d+)\.(\d+)-(\d+)\.(\d+)$/)
  if (range) {
    const r1 = Number(range[1])
    const p1 = Number(range[2])
    const r2 = Number(range[3])
    const p2 = Number(range[4])
    return round === r1 && round === r2 && pick >= p1 && pick <= p2
  }

  const exact = key.match(/^(\d+)\.(\d+)$/)
  if (exact) {
    return round === Number(exact[1]) && pick === Number(exact[2])
  }

  const wildcard = key.match(/^(\d+)\.x$/)
  if (wildcard) {
    return round === Number(wildcard[1])
  }

  return false
}
