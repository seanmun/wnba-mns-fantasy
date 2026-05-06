import type { Sport } from './leagueConfig'

export type PlayerSlot = 'active' | 'bench' | 'ir' | 'redshirt' | 'international'
export type MigrationSource = 'espn' | 'yahoo' | 'sleeper' | 'manual'

export interface RookieDraftInfo {
  round: number
  pick: number
  redshirtEligible: boolean
  redshirtedLastYear?: boolean
}

export interface Player {
  id: string
  fantraxId: string
  name: string
  position: string
  salary: number
  teamCode: string
  leagueId: string
  teamId: string | null
  sport: Sport
  slot: PlayerSlot
  onIR: boolean
  isRookie: boolean
  isInternationalStash: boolean
  intEligible: boolean
  rookieDraftInfo: RookieDraftInfo | null
  keeperPriorYearRound: number | null
  keeperDerivedBaseRound: number | null
  migratedKeeperRound: number | null
  migrationSource: MigrationSource | null
  createdAt: string
  updatedAt: string
}
