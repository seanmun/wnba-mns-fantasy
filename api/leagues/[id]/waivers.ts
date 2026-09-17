import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, sql } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import {
  mnsLeagues,
  mnsPlayers,
  mnsPlayerStatLines,
  mnsTeamOwners,
  mnsTeams,
  mnsWaiverClaims,
} from '../../../src/lib/db/schema.js'
import {
  faWindow,
  logTransaction,
  nextClearDate,
  waiverLog,
  waiverPriority,
} from '../../../src/lib/season/waivers.js'
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

      // Season averages from the real box scores on file — the
      // research half of "who do I pick up".
      const agg = await db
        .select({
          playerId: mnsPlayerStatLines.playerId,
          gp: sql<number>`count(*) filter (where ${mnsPlayerStatLines.min} > 0)`,
          pts: sql<number>`coalesce(sum(${mnsPlayerStatLines.pts}), 0)`,
          reb: sql<number>`coalesce(sum(${mnsPlayerStatLines.reb}), 0)`,
          ast: sql<number>`coalesce(sum(${mnsPlayerStatLines.ast}), 0)`,
          stl: sql<number>`coalesce(sum(${mnsPlayerStatLines.stl}), 0)`,
          blk: sql<number>`coalesce(sum(${mnsPlayerStatLines.blk}), 0)`,
          tpm: sql<number>`coalesce(sum(${mnsPlayerStatLines.tpm}), 0)`,
          fgm: sql<number>`coalesce(sum(${mnsPlayerStatLines.fgm}), 0)`,
          fga: sql<number>`coalesce(sum(${mnsPlayerStatLines.fga}), 0)`,
        })
        .from(mnsPlayerStatLines)
        .where(eq(mnsPlayerStatLines.leagueId, leagueId))
        .groupBy(mnsPlayerStatLines.playerId)
      const per = (v: number, gp: number) => (gp > 0 ? Math.round((v / gp) * 10) / 10 : 0)
      const avgByPlayer = new Map(
        agg.map((a) => [
          a.playerId,
          {
            gp: Number(a.gp),
            ppg: per(Number(a.pts), Number(a.gp)),
            rpg: per(Number(a.reb), Number(a.gp)),
            apg: per(Number(a.ast), Number(a.gp)),
            spg: per(Number(a.stl), Number(a.gp)),
            bpg: per(Number(a.blk), Number(a.gp)),
            tpg: per(Number(a.tpm), Number(a.gp)),
            fgPct: Number(a.fga) > 0 ? Math.round((Number(a.fgm) / Number(a.fga)) * 1000) / 10 : 0,
          },
        ])
      )

      const teams = await db.select().from(mnsTeams).where(eq(mnsTeams.leagueId, leagueId))
      const teamName = new Map(teams.map((t) => [t.id, t.name]))
      const playerName = new Map(players.map((p) => [p.id, p.name]))

      const window = await faWindow()
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
        // 'open' = instant add/drop until today's first tip; 'waivers'
        // = claims queue for tomorrow morning's clear.
        window: window.mode,
        firstTip: window.firstTip,
        clearsOn: nextClearDate(),
        priority: order.map((id, i) => ({ position: i + 1, teamId: id, teamName: teamName.get(id) ?? id, isMe: mine?.teamId === id })),
        myRoster: players
          .filter((p) => mine && p.teamId === mine.teamId)
          .map((p) => ({ id: p.id, name: p.name, position: p.position, teamCode: p.teamCode, salary: p.salary, avg: avgByPlayer.get(p.id) ?? null }))
          .sort((a, b) => (b.avg?.ppg ?? 0) - (a.avg?.ppg ?? 0)),
        freeAgents: players
          .filter((p) => p.teamId == null)
          .map((p) => ({ id: p.id, name: p.name, position: p.position, teamCode: p.teamCode, salary: p.salary, avg: avgByPlayer.get(p.id) ?? null }))
          .sort((a, b) => (b.avg?.ppg ?? 0) - (a.avg?.ppg ?? 0)),
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

      // Before the day's first tip, free agency is OPEN: the move
      // executes right now, first tap wins, no priority cost.
      const window = await faWindow()
      if (window.mode === 'open') {
        const addId = addPlayerIds[0]
        const league2 = league.config as import('../../../src/types/leagueConfig.js').LeagueConfig
        if (league2.cap?.enabled) {
          const rows = await db
            .select({ teamId: mnsPlayers.teamId, salary: mnsPlayers.salary, id: mnsPlayers.id })
            .from(mnsPlayers)
            .where(eq(mnsPlayers.leagueId, leagueId))
          const rosterSalary = rows
            .filter((p) => p.teamId === mine.teamId)
            .reduce((n, p) => n + (p.salary ?? 0), 0)
          const addSal = rows.find((p) => p.id === addId)?.salary ?? 0
          const dropSal = rows.find((p) => p.id === dropPlayerId)?.salary ?? 0
          if (rosterSalary - dropSal + addSal > league2.cap.hardCap) {
            return res.status(400).json({ error: 'That pickup would put you over the hard cap.' })
          }
        }
        // Two updates guarded by current state — if someone else took
        // the player a second ago, the first update writes zero rows
        // and the move honestly fails.
        const took = await db
          .update(mnsPlayers)
          .set({ teamId: mine.teamId, slot: 'active' })
          .where(
            and(
              eq(mnsPlayers.leagueId, leagueId),
              eq(mnsPlayers.id, addId),
              sql`${mnsPlayers.teamId} is null`
            )
          )
          .returning({ id: mnsPlayers.id, name: mnsPlayers.name })
        if (took.length === 0) {
          return res.status(409).json({ error: 'Somebody beat you to that player — refresh and pick again.' })
        }
        const [droppedRow] = await db
          .update(mnsPlayers)
          .set({ teamId: null, slot: 'active' })
          .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.id, dropPlayerId)))
          .returning({ name: mnsPlayers.name })
        await logTransaction(db, leagueId, 'add_drop', [mine.teamId], {
          added: took[0].name,
          dropped: droppedRow?.name ?? dropPlayerId,
        })
        return res.status(200).json({ ok: true, instant: true, added: took[0].name })
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
