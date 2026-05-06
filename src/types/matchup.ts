export const MATCHUP_CATEGORIES_DEFAULT = [
  'FG%',
  'FT%',
  '3PM',
  'PTS',
  'REB',
  'AST',
  'STL',
  'BLK',
  'A/TO',
] as const

export type MatchupCategory = (typeof MATCHUP_CATEGORIES_DEFAULT)[number]

export interface TeamRecord {
  wins: number
  losses: number
  ties: number
}

export interface LeagueWeek {
  id: string
  leagueId: string
  seasonYear: number
  weekNumber: number
  matchupWeek: number
  startDate: string
  endDate: string
  isTradeDeadlineWeek: boolean
  label?: string
}

export interface Matchup {
  id: string
  leagueId: string
  seasonYear: number
  matchupWeek: number
  homeTeamId: string
  awayTeamId: string
  homeScore: number | null
  awayScore: number | null
}

export interface DailyLineup {
  id: string
  leagueId: string
  teamId: string
  gameDate: string
  activePlayerIds: string[]
  updatedAt: string
  updatedBy: string | null
}

export interface Game {
  id: string
  seasonYear: number
  gameDate: string
  awayTeam: string
  homeTeam: string
  isCupGame: boolean
  notes: string | null
}
