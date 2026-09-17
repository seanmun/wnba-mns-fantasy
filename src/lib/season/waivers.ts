import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { mnsPlayers, mnsTeams, mnsWaiverClaims } from '../db/schema.js'
import { computeStandings, easternToday } from './score.js'
import type { LeagueConfig } from '../../types/leagueConfig.js'

// The waiver engine, golf's model on a daily cycle: claims submitted
// today clear at the first tick at/after 8am Eastern TOMORROW, best
// record first (the platform's waiver law — priority rewards the top).
// One transaction per team per clearing day; the ordered preference
// list means being sniped costs that player, not the whole move.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const ET_HOUR = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  hour12: false,
})

export function nextClearDate(now = new Date()): string {
  return easternToday(new Date(now.getTime() + 24 * 3600 * 1000))
}

export interface WaiverResult {
  processed: number
  granted: number
  failed: number
}

// Priority: best record first, category wins as tiebreak, then team
// creation order so the answer never depends on row order.
export async function waiverPriority(db: Db, leagueId: string): Promise<string[]> {
  const teams = await db
    .select()
    .from(mnsTeams)
    .where(eq(mnsTeams.leagueId, leagueId))
    .orderBy(mnsTeams.createdAt)
  const rec = await computeStandings(db, leagueId)
  return teams
    .map((t: { id: string }, i: number) => ({ id: t.id, i, r: rec.get(t.id) ?? { wins: 0, losses: 0, ties: 0, pointsFor: 0 } }))
    .sort(
      (a: { r: { wins: number; pointsFor: number }; i: number }, b: { r: { wins: number; pointsFor: number }; i: number }) =>
        b.r.wins - a.r.wins || b.r.pointsFor - a.r.pointsFor || a.i - b.i
    )
    .map((t: { id: string }) => t.id)
}

export async function processWaivers(
  db: Db,
  leagueId: string,
  config: LeagueConfig,
  now = new Date()
): Promise<WaiverResult> {
  const result: WaiverResult = { processed: 0, granted: 0, failed: 0 }
  // The clearing moment is 8am Eastern — before that, today's due
  // claims stay pending so late-night submitters aren't racing the
  // clock at 12:01.
  if (Number(ET_HOUR.format(now)) < 8) return result

  const due = await db
    .select()
    .from(mnsWaiverClaims)
    .where(
      and(
        eq(mnsWaiverClaims.leagueId, leagueId),
        eq(mnsWaiverClaims.status, 'pending'),
        lte(mnsWaiverClaims.clearsOn, easternToday(now))
      )
    )
  if (due.length === 0) return result

  const order = await waiverPriority(db, leagueId)
  const rank = new Map(order.map((id, i) => [id, i]))
  due.sort(
    (a: { teamId: string }, b: { teamId: string }) =>
      (rank.get(a.teamId) ?? 99) - (rank.get(b.teamId) ?? 99)
  )

  const players = await db
    .select({ id: mnsPlayers.id, teamId: mnsPlayers.teamId, salary: mnsPlayers.salary })
    .from(mnsPlayers)
    .where(eq(mnsPlayers.leagueId, leagueId))
  const byId = new Map(players.map((p: { id: string }) => [p.id, p]))

  const hardCap = config.cap?.enabled ? config.cap.hardCap : null

  for (const claim of due) {
    result.processed++
    const drop = byId.get(claim.dropPlayerId) as { id: string; teamId: string | null; salary: number } | undefined
    let grantedId: string | null = null
    let reason: string | null = null

    if (!drop || drop.teamId !== claim.teamId) {
      reason = 'The player you offered to drop is no longer on your roster.'
    } else {
      for (const addId of claim.addPlayerIds as string[]) {
        const add = byId.get(addId) as { id: string; teamId: string | null; salary: number } | undefined
        if (!add || add.teamId != null) continue // taken (possibly by a better-ranked claim this pass)
        if (hardCap != null) {
          const rosterSalary = (players as Array<{ teamId: string | null; salary: number }>)
            .filter((p) => p.teamId === claim.teamId)
            .reduce((n, p) => n + (p.salary ?? 0), 0)
          if (rosterSalary - (drop.salary ?? 0) + (add.salary ?? 0) > hardCap) {
            reason = 'That add would put you over the hard cap.'
            continue
          }
        }
        grantedId = addId
        break
      }
      if (!grantedId && !reason) reason = 'Everyone on your list was already taken.'
    }

    if (grantedId) {
      await db
        .update(mnsPlayers)
        .set({ teamId: claim.teamId, slot: 'active' })
        .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.id, grantedId)))
      await db
        .update(mnsPlayers)
        .set({ teamId: null, slot: 'active' })
        .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.id, claim.dropPlayerId)))
      // Keep the in-memory picture current so later claims this pass
      // see the grant — contention is decided HERE, in priority order.
      ;(byId.get(grantedId) as { teamId: string | null }).teamId = claim.teamId
      ;(byId.get(claim.dropPlayerId) as { teamId: string | null }).teamId = null
      await db
        .update(mnsWaiverClaims)
        .set({ status: 'granted', grantedPlayerId: grantedId, processedAt: now, updatedAt: now })
        .where(eq(mnsWaiverClaims.id, claim.id))
      result.granted++
    } else {
      await db
        .update(mnsWaiverClaims)
        .set({ status: 'failed', failureReason: reason, processedAt: now, updatedAt: now })
        .where(eq(mnsWaiverClaims.id, claim.id))
      result.failed++
    }
  }

  return result
}

// Referenced by the API for the transaction log.
export async function waiverLog(db: Db, leagueId: string, limit = 30) {
  return db
    .select()
    .from(mnsWaiverClaims)
    .where(
      and(
        eq(mnsWaiverClaims.leagueId, leagueId),
        inArray(mnsWaiverClaims.status, ['granted', 'failed'])
      )
    )
    .orderBy(sql`${mnsWaiverClaims.processedAt} desc nulls last`)
    .limit(limit)
}
