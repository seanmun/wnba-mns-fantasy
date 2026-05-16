import type { LeagueConfig } from '../types/leagueConfig'
import type { Player } from '../types/player'
import type { Decision, RosterEntry, RosterSummary } from '../types/roster'
import { stackKeeperRounds, computeSummary } from './keeperRules'

export interface TradeAssetForCap {
  type: 'keeper' | 'redshirt' | 'int_stash' | 'rookie_pick'
  id: string
  salary: number
  fromTeamId: string
  toTeamId: string
}

export interface TeamCapImpact {
  teamId: string
  teamName: string
  before: RosterSummary
  after: RosterSummary
  salaryIn: number
  salaryOut: number
  warnings: string[]
}

// Pure cap-impact preview for a proposed trade. No DB, no side effects.
export function computeTradeCapImpact(params: {
  assets: TradeAssetForCap[]
  rosters: Map<string, RosterEntry[]>
  players: Map<string, Player>
  tradeDelta: Map<string, number>
  teamNames: Map<string, string>
  config: LeagueConfig
}): TeamCapImpact[] {
  const { assets, rosters, players, tradeDelta, teamNames, config } = params

  const involvedTeamIds = new Set<string>()
  for (const asset of assets) {
    involvedTeamIds.add(asset.fromTeamId)
    involvedTeamIds.add(asset.toTeamId)
  }

  const results: TeamCapImpact[] = []

  for (const teamId of involvedTeamIds) {
    const teamName = teamNames.get(teamId) ?? teamId
    const currentEntries = rosters.get(teamId) ?? []
    const delta = tradeDelta.get(teamId) ?? 0

    const beforeEntries = currentEntries.map((e) => ({ ...e }))
    const beforeStack = stackKeeperRounds(
      beforeEntries.filter((e) => e.decision === 'KEEP'),
      config
    )
    const beforeSummary = computeSummary({
      entries: beforeEntries,
      allPlayers: players,
      config,
      tradeDelta: delta,
      franchiseTags: beforeStack.franchiseTags,
    })

    const outgoingIds = new Set(
      assets
        .filter((a) => a.fromTeamId === teamId && a.type !== 'rookie_pick')
        .map((a) => a.id)
    )
    const incoming = assets.filter(
      (a) => a.toTeamId === teamId && a.type !== 'rookie_pick'
    )

    const afterEntries: RosterEntry[] = currentEntries
      .filter((e) => !outgoingIds.has(e.playerId))
      .map((e) => ({ ...e }))

    for (const asset of incoming) {
      const decision: Decision =
        asset.type === 'redshirt'
          ? 'REDSHIRT'
          : asset.type === 'int_stash'
            ? 'INT_STASH'
            : 'KEEP'
      afterEntries.push({
        playerId: asset.id,
        decision,
        baseRound: config.draft.rounds,
      })
    }

    const afterStack = stackKeeperRounds(
      afterEntries.filter((e) => e.decision === 'KEEP'),
      config
    )
    const afterSummary = computeSummary({
      entries: afterEntries,
      allPlayers: players,
      config,
      tradeDelta: delta,
      franchiseTags: afterStack.franchiseTags,
    })

    const salaryOut = assets
      .filter((a) => a.fromTeamId === teamId && a.type !== 'rookie_pick')
      .reduce((sum, a) => sum + a.salary, 0)
    const salaryIn = assets
      .filter((a) => a.toTeamId === teamId && a.type !== 'rookie_pick')
      .reduce((sum, a) => sum + a.salary, 0)

    const warnings: string[] = []
    const hasAprons = config.cap.firstApron > 0 && config.cap.secondApron > 0
    const fmtCap = (v: number) => `$${Math.round(v / 1_000_000)}M`

    if (hasAprons) {
      if (
        afterSummary.capUsed > config.cap.firstApron &&
        beforeSummary.capUsed <= config.cap.firstApron
      ) {
        warnings.push(
          `Crosses first apron (${fmtCap(config.cap.firstApron)}) — $${config.fees.firstApronFee} one-time fee`
        )
      }
      if (
        afterSummary.capUsed > config.cap.secondApron &&
        beforeSummary.capUsed <= config.cap.secondApron
      ) {
        warnings.push(
          `Crosses second apron (${fmtCap(config.cap.secondApron)}) — $${config.cap.penaltyRatePerM}/M penalty applies`
        )
      }
      if (
        afterSummary.capUsed > config.cap.secondApron &&
        beforeSummary.capUsed > config.cap.secondApron
      ) {
        const beforeOver = Math.ceil(
          (beforeSummary.capUsed - config.cap.secondApron) / 1_000_000
        )
        const afterOver = Math.ceil(
          (afterSummary.capUsed - config.cap.secondApron) / 1_000_000
        )
        if (afterOver > beforeOver) {
          warnings.push(
            `Increases second apron penalty from $${beforeOver * config.cap.penaltyRatePerM} to $${afterOver * config.cap.penaltyRatePerM}`
          )
        }
      }
    }
    if (afterSummary.capUsed > config.cap.hardCap) {
      warnings.push(`Exceeds hard cap ceiling (${fmtCap(config.cap.hardCap)})`)
    }

    results.push({
      teamId,
      teamName,
      before: beforeSummary,
      after: afterSummary,
      salaryIn,
      salaryOut,
      warnings,
    })
  }

  return results
}

export function isTradeDeadlinePassed(
  config: LeagueConfig,
  today: Date = new Date()
): boolean {
  if (!config.schedule.tradeDeadlineDate) return false
  const todayStr = today.toISOString().slice(0, 10)
  return todayStr > config.schedule.tradeDeadlineDate
}
