import type { LeagueConfig, ScoringModeId } from './leagueConfig'

export type LeaguePhase =
  | 'rookie_draft'
  | 'keeper_season'
  | 'draft'
  | 'regular_season'
  | 'playoffs'
  | 'champion'

export const LEAGUE_PHASE_ORDER: LeaguePhase[] = [
  'rookie_draft',
  'keeper_season',
  'draft',
  'regular_season',
  'playoffs',
  'champion',
]

export const LEAGUE_PHASE_LABELS: Record<LeaguePhase, string> = {
  rookie_draft: 'Rookie Draft',
  keeper_season: 'Keeper Season',
  draft: 'Draft',
  regular_season: 'Regular Season',
  playoffs: 'Playoffs',
  champion: 'Champion',
}

export type ScoringMode = ScoringModeId

export interface League {
  id: string
  name: string
  seasonYear: number
  config: LeagueConfig
  leaguePhase: LeaguePhase
  keepersLocked: boolean
  commissionerId: string | null
  scoringMode: ScoringMode
  seasonStartedAt: string | null
  seasonStartedBy: string | null
  telegramChatId: string | null
  createdAt: string
  updatedAt: string
}
