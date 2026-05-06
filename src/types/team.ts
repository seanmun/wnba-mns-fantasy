export interface TeamCapAdjustments {
  tradeDelta: number
}

export interface Team {
  id: string
  leagueId: string
  name: string
  abbrev: string
  telegramUsername: string | null
  capAdjustments: TeamCapAdjustments
  banners: number[]
  createdAt: string
  updatedAt: string
}

export interface TeamOwner {
  teamId: string
  userId: string | null
  email: string
  displayName: string | null
  isPrimary: boolean
  createdAt: string
}
