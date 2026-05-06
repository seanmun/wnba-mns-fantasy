export type Sport = 'wnba' | 'nba'
export type ScoringModeId = 'matchup_record' | 'category_record'
export type DraftType = 'snake' | 'auction'
export type RookieOrderMethod = 'lottery' | 'manual' | 'season_record'
export type KeeperAdvanceRule = 'minus_one' | 'flat' | 'custom'

export interface LeagueConfig {
  sport: Sport
  season: {
    year: number
    startDate: string
    weeks: number
  }
  roster: {
    activeSize: number
    starterSize: number
    irSlots: number
    benchAllowed: boolean
    maxKeepers: number
    redshirtsAllowed: boolean
    intStashAllowed: boolean
  }
  draft: {
    rounds: number
    type: DraftType
    rookieRounds: number
    rookieYearsTracked: number
    rookieOrderMethod: RookieOrderMethod
    allowAdminOverride: boolean
  }
  cap: {
    enabled: boolean
    floor: number
    base: number
    firstApron: number
    secondApron: number
    hardCap: number
    tradeDelta: number
    penaltyRatePerM: number
  }
  fees: {
    buyIn: number
    firstApronFee: number
    franchiseTagFee: number
    redshirtFee: number
    activationFee: number
    penaltyRatePerM: number
  }
  scoring: {
    categories: string[]
    mode: ScoringModeId
  }
  keeper: {
    rookieRoundMap: Record<string, number>
    advanceRule: KeeperAdvanceRule
    fallbackRound: number | null
    franchiseTagAllowed: boolean
    intStashAllowed: boolean
  }
  schedule: {
    tradeDeadlineWeek: number
    tradeDeadlineDate: string
    playoffTeams: number
    playoffWeeks: number
    playoffByeTeams: number
    consolationWeeks: number
    combineCup: boolean
    combineAllStar: boolean
    extendFirstWeek: boolean
  }
  prizePool: {
    enabled: boolean
    walletEnabled: boolean
    zones: {
      boilerThreshold: number
      bernieThreshold: number
      gekkoSplit: [number, number, number]
      bernieSplit: number[]
      boilerSmallSplit: [number, number]
    }
  }
  notifications: {
    telegramEnabled: boolean
    telegramChatId?: string
    emailEnabled: boolean
    drafts: boolean
    trades: boolean
    wagers: boolean
  }
}
