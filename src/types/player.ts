import type { Sport } from './leagueConfig'

export type PlayerSlot = 'active' | 'bench' | 'ir' | 'redshirt' | 'international'
export type MigrationSource = 'espn' | 'yahoo' | 'sleeper' | 'fantrax' | 'manual'

// Platform-specific player identifiers. Each platform writes its own
// key when syncing. WNBA players won't have `fantrax` (Fantrax doesn't
// cover WNBA); NBA players from Fantrax will. Add new keys as new
// sources land.
export interface ExternalIds {
  fantrax?: string
  hhs?: string // Her Hoop Stats slug
  wnba?: string // wnba.com / stats.wnba.com player ID
  yahoo?: string
  espn?: string
  sleeper?: string
}

export interface RookieDraftInfo {
  round: number
  pick: number
  redshirtEligible: boolean
  redshirtedLastYear?: boolean
}

export interface Player {
  id: string
  externalIds: ExternalIds
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
