export type Decision = 'KEEP' | 'DROP' | 'REDSHIRT' | 'INT_STASH'
export type RosterStatus = 'draft' | 'submitted' | 'adminLocked'

export interface RosterEntry {
  playerId: string
  decision: Decision
  baseRound?: number
  keeperRound?: number
  priority?: number
  notes?: string
}

export interface RosterSummary {
  keepersCount: number
  draftedCount: number
  redshirtsCount: number
  intStashCount: number
  capUsed: number
  capBase: number
  capTradeDelta: number
  capEffective: number
  overSecondApronByM: number
  penaltyDues: number
  franchiseTags: number
  franchiseTagDues: number
  redshirtDues: number
  firstApronFee: number
  activationDues: number
  totalFees: number
}

export interface SavedScenario {
  scenarioId: string
  name: string
  timestamp: number
  savedBy?: string
  entries: RosterEntry[]
  summary: RosterSummary
}

export interface Roster {
  id: string
  leagueId: string
  teamId: string
  seasonYear: number
  entries: RosterEntry[]
  summary: RosterSummary
  status: RosterStatus
  savedScenarios: SavedScenario[]
  createdAt: string
  updatedAt: string
}

export interface RegularSeasonRoster {
  id: string
  leagueId: string
  teamId: string
  seasonYear: number
  activeRoster: string[]
  irSlots: string[]
  redshirtPlayers: string[]
  internationalPlayers: string[]
  benchedPlayers: string[]
  isLegalRoster: boolean
  lastUpdated: string
  updatedBy: string | null
}
