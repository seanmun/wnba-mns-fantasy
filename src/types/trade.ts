export type TradeStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'executed'

export type TradeAssetType = 'player' | 'pick' | 'rookie_pick'

export interface TradeAsset {
  type: TradeAssetType
  id: string
  displayName: string
  salary?: number
  fromTeamId: string
  toTeamId: string
}

export interface TradeProposal {
  id: string
  leagueId: string
  seasonYear: number
  proposedByTeamId: string
  proposedByUserId: string
  status: TradeStatus
  assets: TradeAsset[]
  involvedTeamIds: string[]
  note: string | null
  expiresAt: string | null
  executedAt: string | null
  executedBy: string | null
  createdAt: string
  updatedAt: string
}

export type TradeResponseStatus = 'pending' | 'accepted' | 'rejected'

export interface TradeProposalResponse {
  id: string
  proposalId: string
  teamId: string
  status: TradeResponseStatus
  respondedBy: string | null
  respondedAt: string | null
  createdAt: string
  updatedAt: string
}
