export type WagerStatus = 'pending' | 'accepted' | 'declined' | 'live' | 'settled'

export interface Wager {
  id: string
  leagueId: string
  seasonYear: number
  proposerTeamId: string
  opponentTeamId: string
  description: string
  amount: number
  settlementDate: string | null
  status: WagerStatus
  proposedAt: string
  proposedBy: string
  respondedAt: string | null
  respondedBy: string | null
  settledAt: string | null
  winnerTeamId: string | null
  createdAt: string
  updatedAt: string
}
