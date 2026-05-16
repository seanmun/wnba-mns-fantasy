import type { LeagueConfig } from '../types/leagueConfig'
import type { TeamRecord } from '../types/matchup'

export type CategoryStats = Record<string, number>

export interface MatchupResult {
  homeStats: CategoryStats
  awayStats: CategoryStats
  homeCategoryWins: number
  awayCategoryWins: number
  ties: number
  homeRecord: TeamRecord
  awayRecord: TeamRecord
}

// Compute a matchup result from category stat totals.
//
// scoring.mode = 'category_record':
//   Each category counts as a W/L/T. The team with more category
//   wins also tallies match-level W, but the granular record is
//   the cat-by-cat sum.
//
// scoring.mode = 'matchup_record':
//   The team with more category wins gets 1 W. Tie if category wins
//   are equal.
export function computeMatchupResult(
  homeStats: CategoryStats,
  awayStats: CategoryStats,
  config: LeagueConfig
): MatchupResult {
  let homeCategoryWins = 0
  let awayCategoryWins = 0
  let ties = 0

  for (const cat of config.scoring.categories) {
    const h = homeStats[cat] ?? 0
    const a = awayStats[cat] ?? 0
    if (h > a) homeCategoryWins++
    else if (a > h) awayCategoryWins++
    else ties++
  }

  let homeRecord: TeamRecord
  let awayRecord: TeamRecord

  if (config.scoring.mode === 'category_record') {
    homeRecord = { wins: homeCategoryWins, losses: awayCategoryWins, ties }
    awayRecord = { wins: awayCategoryWins, losses: homeCategoryWins, ties }
  } else {
    if (homeCategoryWins > awayCategoryWins) {
      homeRecord = { wins: 1, losses: 0, ties: 0 }
      awayRecord = { wins: 0, losses: 1, ties: 0 }
    } else if (awayCategoryWins > homeCategoryWins) {
      homeRecord = { wins: 0, losses: 1, ties: 0 }
      awayRecord = { wins: 1, losses: 0, ties: 0 }
    } else {
      homeRecord = { wins: 0, losses: 0, ties: 1 }
      awayRecord = { wins: 0, losses: 0, ties: 1 }
    }
  }

  return {
    homeStats,
    awayStats,
    homeCategoryWins,
    awayCategoryWins,
    ties,
    homeRecord,
    awayRecord,
  }
}
