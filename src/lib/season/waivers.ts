import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { mnsPlayers, mnsTeams, mnsTransactions, mnsWaiverClaims } from '../db/schema.js'
import { easternToday } from './score.js'
import type { LeagueConfig } from '../../types/leagueConfig.js'

// Free agency, Sean's spec from the live beta (2026-09-17):
// - Until the day's FIRST TIPOFF, the pool is open — anyone picks up
//   anyone instantly, naming the drop in the same move. Instant
//   pickups cost nothing in priority.
// - From first tip until early morning, FA moves queue as WAIVER
//   CLAIMS that clear at the first tick at/after 8am ET next day.
// - Waiver priority is a rolling line: least recent GRANTED waiver
//   move first; a grant sends you to the back. Never-claimed teams
//   head the line (team creation order between them).
// One claim per team per clearing day; the ordered preference list
// means being sniped costs that player, not the whole move.

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

// Priority: a rolling line ordered by each team's most recent GRANTED
// waiver move — least recent (or never) first, team creation order as
// the tiebreak. Instant pregame pickups deliberately don't appear
// here: only waiver grants cost position.
export async function waiverPriority(db: Db, leagueId: string): Promise<string[]> {
  const teams = await db
    .select()
    .from(mnsTeams)
    .where(eq(mnsTeams.leagueId, leagueId))
    .orderBy(mnsTeams.createdAt)
  const grants = await db
    .select({
      teamId: mnsWaiverClaims.teamId,
      last: sql<string | null>`max(${mnsWaiverClaims.processedAt})`,
    })
    .from(mnsWaiverClaims)
    .where(and(eq(mnsWaiverClaims.leagueId, leagueId), eq(mnsWaiverClaims.status, 'granted')))
    .groupBy(mnsWaiverClaims.teamId)
  const lastByTeam = new Map(
    grants.map((g: { teamId: string; last: string | null }) => [g.teamId, g.last ? new Date(g.last).getTime() : 0])
  )
  return teams
    .map((t: { id: string }, i: number) => ({ id: t.id, i, last: lastByTeam.get(t.id) ?? 0 }))
    .sort(
      (a: { last: number; i: number }, b: { last: number; i: number }) =>
        a.last - b.last || a.i - b.i
    )
    .map((t: { id: string }) => t.id)
}

// Where free agency stands right now, from today's real schedule: the
// pool is OPEN until the first tipoff of the Eastern day (or all day
// when nobody plays), then claims-only until tomorrow's clear.
const ESPN_BOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard'

export async function faWindow(now = new Date()): Promise<{
  mode: 'open' | 'waivers'
  firstTip: string | null
}> {
  try {
    const yyyymmdd = easternToday(now).replace(/-/g, '')
    const board = (await (await fetch(`${ESPN_BOARD}?dates=${yyyymmdd}`)).json()) as {
      events?: Array<{ date: string }>
    }
    const tips = (board.events ?? []).map((e) => new Date(e.date).getTime())
    if (tips.length === 0) return { mode: 'open', firstTip: null }
    const first = Math.min(...tips)
    return {
      mode: now.getTime() < first ? 'open' : 'waivers',
      firstTip: new Date(first).toISOString(),
    }
  } catch {
    // If the schedule is unreachable, fail toward waivers — a queued
    // claim is recoverable; a wrongly-instant pickup is not.
    return { mode: 'waivers', firstTip: null }
  }
}

export async function logTransaction(
  db: Db,
  leagueId: string,
  type: 'add_drop' | 'waiver' | 'trade',
  teamIds: string[],
  detail: Record<string, unknown>
) {
  await db.insert(mnsTransactions).values({ leagueId, type, teamIds, detail })
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
    .select({ id: mnsPlayers.id, name: mnsPlayers.name, teamId: mnsPlayers.teamId, salary: mnsPlayers.salary })
    .from(mnsPlayers)
    .where(eq(mnsPlayers.leagueId, leagueId))
  const byId = new Map(players.map((p: { id: string }) => [p.id, p]))

  const hardCap = config.cap?.enabled ? config.cap.hardCap : null

  const activeSize = config.roster?.activeSize ?? 10
  for (const claim of due) {
    result.processed++
    const drop = claim.dropPlayerId
      ? (byId.get(claim.dropPlayerId) as { id: string; teamId: string | null; salary: number; name?: string } | undefined)
      : null
    let grantedId: string | null = null
    let reason: string | null = null

    const rosterCount = (players as Array<{ teamId: string | null }>).filter(
      (p) => p.teamId === claim.teamId
    ).length
    if (claim.dropPlayerId && (!drop || drop.teamId !== claim.teamId)) {
      reason = 'The player you offered to drop is no longer on your roster.'
    } else if (!claim.dropPlayerId && rosterCount >= activeSize) {
      reason = 'Your roster is full — resubmit with a drop.'
    } else {
      for (const addId of claim.addPlayerIds as string[]) {
        const add = byId.get(addId) as { id: string; teamId: string | null; salary: number } | undefined
        if (!add || add.teamId != null) continue // taken (possibly by a better-ranked claim this pass)
        if (hardCap != null) {
          const rosterSalary = (players as Array<{ teamId: string | null; salary: number }>)
            .filter((p) => p.teamId === claim.teamId)
            .reduce((n, p) => n + (p.salary ?? 0), 0)
          if (rosterSalary - (drop?.salary ?? 0) + (add.salary ?? 0) > hardCap) {
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
      if (claim.dropPlayerId) {
        await db
          .update(mnsPlayers)
          .set({ teamId: null, slot: 'active' })
          .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.id, claim.dropPlayerId)))
        ;(byId.get(claim.dropPlayerId) as { teamId: string | null }).teamId = null
      }
      // Keep the in-memory picture current so later claims this pass
      // see the grant — contention is decided HERE, in priority order.
      ;(byId.get(grantedId) as { teamId: string | null }).teamId = claim.teamId
      await db
        .update(mnsWaiverClaims)
        .set({ status: 'granted', grantedPlayerId: grantedId, processedAt: now, updatedAt: now })
        .where(eq(mnsWaiverClaims.id, claim.id))
      await logTransaction(db, leagueId, 'waiver', [claim.teamId], {
        added: (byId.get(grantedId) as { name?: string })?.name ?? grantedId,
        ...(claim.dropPlayerId
          ? { dropped: (byId.get(claim.dropPlayerId) as { name?: string })?.name ?? claim.dropPlayerId }
          : {}),
      })
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
