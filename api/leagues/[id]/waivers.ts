import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, sql } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import {
  mnsLeagues,
  mnsPlayers,
  mnsTeamOwners,
  mnsTeams,
  mnsWaiverClaims,
} from '../../../src/lib/db/schema.js'
import { nextClearDate, waiverLog, waiverPriority } from '../../../src/lib/season/waivers.js'
import { logger } from '../../_logger.js'

// The waiver wire. Claims submitted today clear tomorrow at 8am ET,
// best record first. One transaction per team per clearing day —
// resubmitting REPLACES the pending claim (the unique key guarantees
// it). The preference list is ordered: being sniped costs that player,
// not the whole move.
//
// GET    /api/leagues/:id/waivers — my roster, free agents, my claim,
//        the priority order (public — knowing you pick third is the
//        point), and the transaction log
// POST   { addPlayerIds: string[], dropPlayerId } — submit or replace
// DELETE — withdraw my pending claim
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
  const [league] = await db.select().from(mnsLeagues).where(eq(mnsLeagues.id, leagueId)).limit(1)
  if (!league) return res.status(404).json({ error: 'League not found' })

  // The caller's team: waivers are an OWNER act.
  const [mine] = await db
    .select({ teamId: mnsTeamOwners.teamId, teamName: mnsTeams.name })
    .from(mnsTeamOwners)
    .innerJoin(mnsTeams, eq(mnsTeams.id, mnsTeamOwners.teamId))
    .where(and(eq(mnsTeams.leagueId, leagueId), eq(mnsTeamOwners.userId, userId)))
    .limit(1)

  try {
    if (req.method === 'GET') {
      const players = await db
        .select()
        .from(mnsPlayers)
        .where(eq(mnsPlayers.leagueId, leagueId))
      const teams = await db.select().from(mnsTeams).where(eq(mnsTeams.leagueId, leagueId))
      const teamName = new Map(teams.map((t) => [t.id, t.name]))
      const playerName = new Map(players.map((p) => [p.id, p.name]))

      const order = await waiverPriority(db, leagueId)
      const myClaim = mine
        ? (
            await db
              .select()
              .from(mnsWaiverClaims)
              .where(
                and(eq(mnsWaiverClaims.teamId, mine.teamId), eq(mnsWaiverClaims.status, 'pending'))
              )
              .orderBy(sql`${mnsWaiverClaims.createdAt} desc`)
              .limit(1)
          )[0] ?? null
        : null

      const log = await waiverLog(db, leagueId)

      return res.status(200).json({
        myTeamId: mine?.teamId ?? null,
        clearsOn: nextClearDate(),
        priority: order.map((id, i) => ({ position: i + 1, teamId: id, teamName: teamName.get(id) ?? id, isMe: mine?.teamId === id })),
        myRoster: players
          .filter((p) => mine && p.teamId === mine.teamId)
          .map((p) => ({ id: p.id, name: p.name, position: p.position, teamCode: p.teamCode, salary: p.salary }))
          .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0)),
        freeAgents: players
          .filter((p) => p.teamId == null)
          .map((p) => ({ id: p.id, name: p.name, position: p.position, teamCode: p.teamCode, salary: p.salary }))
          .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0)),
        myClaim: myClaim
          ? {
              id: myClaim.id,
              clearsOn: myClaim.clearsOn,
              addPlayerIds: myClaim.addPlayerIds,
              addNames: (myClaim.addPlayerIds as string[]).map((id) => playerName.get(id) ?? id),
              dropPlayerId: myClaim.dropPlayerId,
              dropName: playerName.get(myClaim.dropPlayerId) ?? myClaim.dropPlayerId,
            }
          : null,
        log: log.map((c: typeof mnsWaiverClaims.$inferSelect) => ({
          teamName: teamName.get(c.teamId) ?? c.teamId,
          status: c.status,
          granted: c.grantedPlayerId ? playerName.get(c.grantedPlayerId) ?? c.grantedPlayerId : null,
          dropped: c.status === 'granted' ? playerName.get(c.dropPlayerId) ?? c.dropPlayerId : null,
          reason: c.failureReason,
          processedAt: c.processedAt,
        })),
      })
    }

    if (!mine) return res.status(403).json({ error: "You don't own a team in this league." })

    if (req.method === 'POST') {
      const addPlayerIds = (req.body?.addPlayerIds ?? []) as string[]
      const dropPlayerId = String(req.body?.dropPlayerId ?? '')
      if (!Array.isArray(addPlayerIds) || addPlayerIds.length === 0 || !dropPlayerId) {
        return res.status(400).json({ error: 'Pick at least one player to add and one to drop.' })
      }
      const players = await db
        .select({ id: mnsPlayers.id, teamId: mnsPlayers.teamId })
        .from(mnsPlayers)
        .where(eq(mnsPlayers.leagueId, leagueId))
      const byId = new Map(players.map((p) => [p.id, p]))
      if (byId.get(dropPlayerId)?.teamId !== mine.teamId) {
        return res.status(400).json({ error: 'That drop is not on your roster.' })
      }
      const notFree = addPlayerIds.filter((id) => byId.get(id)?.teamId != null || !byId.has(id))
      if (notFree.length) {
        return res.status(400).json({ error: 'Someone on your add list is already rostered.' })
      }

      const clearsOn = nextClearDate()
      const [claim] = await db
        .insert(mnsWaiverClaims)
        .values({ leagueId, teamId: mine.teamId, clearsOn, addPlayerIds, dropPlayerId })
        .onConflictDoUpdate({
          target: [mnsWaiverClaims.teamId, mnsWaiverClaims.clearsOn],
          set: {
            addPlayerIds,
            dropPlayerId,
            status: 'pending',
            grantedPlayerId: null,
            failureReason: null,
            processedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning()
      return res.status(200).json({ ok: true, claim: { id: claim.id, clearsOn: claim.clearsOn } })
    }

    if (req.method === 'DELETE') {
      await db
        .update(mnsWaiverClaims)
        .set({ status: 'withdrawn', updatedAt: new Date() })
        .where(
          and(eq(mnsWaiverClaims.teamId, mine.teamId), eq(mnsWaiverClaims.status, 'pending'))
        )
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    logger.error('waivers endpoint failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Waivers hit an error. Try again.' })
  }
}
