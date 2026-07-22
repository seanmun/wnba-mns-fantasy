import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, isNotNull, and, sql } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import {
  mnsLeagues,
  mnsTeams,
  mnsPlayers,
  mnsDrafts,
  mnsRookieDraftPicks,
} from '../../../src/lib/db/schema.js'

export interface SetupStatus {
  teamsCount: number
  playersPoolCount: number
  playersAssignedCount: number
  keepersLocked: boolean
  rookiePicksCount: number
  draftStatus: string | null
  seasonStarted: boolean
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = req.query.id as string | undefined
  if (!leagueId) return res.status(400).json({ error: 'Missing league id' })

  try {
    const [league] = await db
      .select({
        keepersLocked: mnsLeagues.keepersLocked,
        seasonStartedAt: mnsLeagues.seasonStartedAt,
      })
      .from(mnsLeagues)
      .where(eq(mnsLeagues.id, leagueId))
      .limit(1)
    if (!league) return res.status(404).json({ error: 'League not found' })

    const [
      teamsRow,
      poolRow,
      assignedRow,
      rookieRow,
      draftRow,
    ] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` })
        .from(mnsTeams)
        .where(eq(mnsTeams.leagueId, leagueId)),
      db.select({ n: sql<number>`count(*)::int` })
        .from(mnsPlayers)
        .where(eq(mnsPlayers.leagueId, leagueId)),
      db.select({ n: sql<number>`count(*)::int` })
        .from(mnsPlayers)
        .where(and(eq(mnsPlayers.leagueId, leagueId), isNotNull(mnsPlayers.teamId))),
      db.select({ n: sql<number>`count(*)::int` })
        .from(mnsRookieDraftPicks)
        .where(eq(mnsRookieDraftPicks.leagueId, leagueId)),
      db.select({ status: mnsDrafts.status })
        .from(mnsDrafts)
        .where(eq(mnsDrafts.leagueId, leagueId))
        .limit(1),
    ])

    const status: SetupStatus = {
      teamsCount: teamsRow[0]?.n ?? 0,
      playersPoolCount: poolRow[0]?.n ?? 0,
      playersAssignedCount: assignedRow[0]?.n ?? 0,
      keepersLocked: league.keepersLocked,
      rookiePicksCount: rookieRow[0]?.n ?? 0,
      draftStatus: draftRow[0]?.status ?? null,
      seasonStarted: league.seasonStartedAt !== null,
    }
    return res.status(200).json(status)
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load setup status',
    })
  }
}
