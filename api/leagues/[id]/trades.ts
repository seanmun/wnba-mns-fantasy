import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import {
  mnsLeagues,
  mnsPlayers,
  mnsTeamOwners,
  mnsTeams,
  mnsTradeProposals,
  mnsTradeProposalResponses,
} from '../../../src/lib/db/schema.js'
import { isTradeDeadlinePassed } from '../../../src/rules/tradeRules.js'
import { logger } from '../../_logger.js'
import type { TradeAsset } from '../../../src/types/trade.js'
import type { LeagueConfig } from '../../../src/types/leagueConfig.js'

// Trades, the simplest honest version: two teams, players only,
// propose → accept/reject → executed immediately on accept, validated
// at ACCEPT time (rosters move between propose and accept — waivers,
// other trades — so acceptance revalidates everything and refuses
// stale deals rather than executing fiction).
//
// GET  /api/leagues/:id/trades — proposals involving my team + league log
// POST { action: 'propose', toTeamId, givePlayerIds, getPlayerIds, note? }
// POST { action: 'respond', proposalId, accept: boolean }
// POST { action: 'cancel', proposalId }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
  const [league] = await db.select().from(mnsLeagues).where(eq(mnsLeagues.id, leagueId)).limit(1)
  if (!league) return res.status(404).json({ error: 'League not found' })
  const config = league.config as LeagueConfig

  const [mine] = await db
    .select({ teamId: mnsTeamOwners.teamId })
    .from(mnsTeamOwners)
    .innerJoin(mnsTeams, eq(mnsTeams.id, mnsTeamOwners.teamId))
    .where(and(eq(mnsTeams.leagueId, leagueId), eq(mnsTeamOwners.userId, userId)))
    .limit(1)

  try {
    if (req.method === 'GET') {
      const teams = await db.select().from(mnsTeams).where(eq(mnsTeams.leagueId, leagueId))
      const teamName = new Map(teams.map((t) => [t.id, t.name]))
      const proposals = await db
        .select()
        .from(mnsTradeProposals)
        .where(eq(mnsTradeProposals.leagueId, leagueId))
        .orderBy(sql`${mnsTradeProposals.createdAt} desc`)
        .limit(50)
      return res.status(200).json({
        myTeamId: mine?.teamId ?? null,
        deadlinePassed: isTradeDeadlinePassed(config),
        proposals: proposals.map((p) => ({
          id: p.id,
          status: p.status,
          proposedByTeamId: p.proposedByTeamId,
          proposedByTeamName: teamName.get(p.proposedByTeamId) ?? p.proposedByTeamId,
          involvedTeamIds: p.involvedTeamIds,
          involvedTeamNames: (p.involvedTeamIds as string[]).map((t) => teamName.get(t) ?? t),
          assets: p.assets,
          note: p.note,
          createdAt: p.createdAt,
          mineToAnswer:
            !!mine &&
            p.status === 'pending' &&
            (p.involvedTeamIds as string[]).includes(mine.teamId) &&
            p.proposedByTeamId !== mine.teamId,
          mineToCancel: !!mine && p.status === 'pending' && p.proposedByTeamId === mine.teamId,
        })),
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (!mine) return res.status(403).json({ error: "You don't own a team in this league." })
    if (isTradeDeadlinePassed(config)) {
      return res.status(400).json({ error: 'The trade deadline has passed.' })
    }

    const action = String(req.body?.action ?? '')

    if (action === 'propose') {
      const toTeamId = String(req.body?.toTeamId ?? '')
      const givePlayerIds = (req.body?.givePlayerIds ?? []) as string[]
      const getPlayerIds = (req.body?.getPlayerIds ?? []) as string[]
      if (!toTeamId || toTeamId === mine.teamId) {
        return res.status(400).json({ error: 'Pick another team to trade with.' })
      }
      if (givePlayerIds.length === 0 || getPlayerIds.length === 0) {
        return res.status(400).json({ error: 'A trade needs players on both sides.' })
      }
      const players = await db
        .select()
        .from(mnsPlayers)
        .where(
          and(
            eq(mnsPlayers.leagueId, leagueId),
            inArray(mnsPlayers.id, [...givePlayerIds, ...getPlayerIds])
          )
        )
      const byId = new Map(players.map((p) => [p.id, p]))
      const wrongGive = givePlayerIds.filter((id) => byId.get(id)?.teamId !== mine.teamId)
      const wrongGet = getPlayerIds.filter((id) => byId.get(id)?.teamId !== toTeamId)
      if (wrongGive.length || wrongGet.length) {
        return res.status(400).json({ error: 'Every player must be on the team offering them.' })
      }

      const assets: TradeAsset[] = [
        ...givePlayerIds.map((id) => ({
          type: 'player' as const,
          id,
          displayName: byId.get(id)!.name,
          salary: byId.get(id)!.salary ?? undefined,
          fromTeamId: mine.teamId,
          toTeamId,
        })),
        ...getPlayerIds.map((id) => ({
          type: 'player' as const,
          id,
          displayName: byId.get(id)!.name,
          salary: byId.get(id)!.salary ?? undefined,
          fromTeamId: toTeamId,
          toTeamId: mine.teamId,
        })),
      ]

      const proposalId = `trade-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      await db.insert(mnsTradeProposals).values({
        id: proposalId,
        leagueId,
        seasonYear: league.seasonYear,
        proposedByTeamId: mine.teamId,
        proposedByUserId: userId,
        status: 'pending',
        assets,
        involvedTeamIds: [mine.teamId, toTeamId],
        note: (req.body?.note ? String(req.body.note) : null) as string | null,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      })
      await db.insert(mnsTradeProposalResponses).values({
        id: `${proposalId}-resp`,
        proposalId,
        teamId: toTeamId,
        status: 'pending',
      })
      return res.status(201).json({ ok: true, proposalId })
    }

    const proposalId = String(req.body?.proposalId ?? '')
    const [proposal] = await db
      .select()
      .from(mnsTradeProposals)
      .where(and(eq(mnsTradeProposals.id, proposalId), eq(mnsTradeProposals.leagueId, leagueId)))
      .limit(1)
    if (!proposal) return res.status(404).json({ error: 'Trade not found.' })
    if (proposal.status !== 'pending') {
      return res.status(409).json({ error: `That trade is already ${proposal.status}.` })
    }

    if (action === 'cancel') {
      if (proposal.proposedByTeamId !== mine.teamId) {
        return res.status(403).json({ error: 'Only the proposer can cancel.' })
      }
      await db
        .update(mnsTradeProposals)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(mnsTradeProposals.id, proposalId))
      return res.status(200).json({ ok: true })
    }

    if (action === 'respond') {
      const involved = proposal.involvedTeamIds as string[]
      if (!involved.includes(mine.teamId) || proposal.proposedByTeamId === mine.teamId) {
        return res.status(403).json({ error: 'This trade is not yours to answer.' })
      }
      const accept = req.body?.accept === true

      if (!accept) {
        await db
          .update(mnsTradeProposals)
          .set({ status: 'rejected', updatedAt: new Date() })
          .where(eq(mnsTradeProposals.id, proposalId))
        await db
          .update(mnsTradeProposalResponses)
          .set({ status: 'rejected', respondedBy: userId, respondedAt: new Date(), updatedAt: new Date() })
          .where(eq(mnsTradeProposalResponses.proposalId, proposalId))
        return res.status(200).json({ ok: true, status: 'rejected' })
      }

      // Revalidate at accept time: every asset must still sit on the
      // team the proposal says it does — waivers or another trade may
      // have moved someone since. Refuse stale deals; never execute
      // fiction.
      const assets = proposal.assets as TradeAsset[]
      const ids = assets.map((a) => a.id)
      const players = await db
        .select({ id: mnsPlayers.id, teamId: mnsPlayers.teamId, salary: mnsPlayers.salary })
        .from(mnsPlayers)
        .where(and(eq(mnsPlayers.leagueId, leagueId), inArray(mnsPlayers.id, ids)))
      const byId = new Map(players.map((p) => [p.id, p]))
      const stale = assets.filter((a) => byId.get(a.id)?.teamId !== a.fromTeamId)
      if (stale.length) {
        await db
          .update(mnsTradeProposals)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(mnsTradeProposals.id, proposalId))
        return res.status(409).json({
          error: `${stale.map((a) => a.displayName).join(', ')} ${stale.length === 1 ? 'is' : 'are'} no longer where this trade left ${stale.length === 1 ? 'them' : 'them'} — the proposal has been voided.`,
        })
      }

      // Hard-cap check for both sides, same rule the waiver wire uses.
      if (config.cap?.enabled) {
        const all = await db
          .select({ teamId: mnsPlayers.teamId, salary: mnsPlayers.salary })
          .from(mnsPlayers)
          .where(eq(mnsPlayers.leagueId, leagueId))
        for (const teamId of involved) {
          const current = all
            .filter((p) => p.teamId === teamId)
            .reduce((n, p) => n + (p.salary ?? 0), 0)
          const out = assets.filter((a) => a.fromTeamId === teamId).reduce((n, a) => n + (a.salary ?? 0), 0)
          const inn = assets.filter((a) => a.toTeamId === teamId).reduce((n, a) => n + (a.salary ?? 0), 0)
          if (current - out + inn > config.cap.hardCap) {
            return res.status(400).json({ error: 'This trade would put a team over the hard cap.' })
          }
        }
      }

      for (const a of assets) {
        await db
          .update(mnsPlayers)
          .set({ teamId: a.toTeamId, slot: 'active' })
          .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.id, a.id)))
      }
      await db
        .update(mnsTradeProposals)
        .set({ status: 'executed', updatedAt: new Date() })
        .where(eq(mnsTradeProposals.id, proposalId))
      await db
        .update(mnsTradeProposalResponses)
        .set({ status: 'accepted', respondedBy: userId, respondedAt: new Date(), updatedAt: new Date() })
        .where(eq(mnsTradeProposalResponses.proposalId, proposalId))
      return res.status(200).json({ ok: true, status: 'executed' })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    logger.error('trades endpoint failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Trades hit an error. Try again.' })
  }
}
