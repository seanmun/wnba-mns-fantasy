import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { verifyAuth, canManageLeague } from '../../_middleware.js'
import { db } from '../../_db.js'
import { mnsLeagues } from '../../../src/lib/db/schema.js'
import { logger } from '../../_logger.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = req.query.id as string | undefined
  if (!leagueId) return res.status(400).json({ error: 'Missing league id' })

  if (!(await canManageLeague(userId, leagueId))) {
    return res
      .status(403)
      .json({ error: 'Only the commissioner can start the season' })
  }

  try {
    const [league] = await db
      .select({ seasonStartedAt: mnsLeagues.seasonStartedAt })
      .from(mnsLeagues)
      .where(eq(mnsLeagues.id, leagueId))
      .limit(1)
    if (!league) return res.status(404).json({ error: 'League not found' })
    if (league.seasonStartedAt) {
      return res.status(409).json({ error: 'Season already started' })
    }

    const now = new Date()
    const [row] = await db
      .update(mnsLeagues)
      .set({
        leaguePhase: 'regular_season',
        seasonStartedAt: now,
        seasonStartedBy: userId,
        updatedAt: now,
      })
      .where(eq(mnsLeagues.id, leagueId))
      .returning({
        leaguePhase: mnsLeagues.leaguePhase,
        seasonStartedAt: mnsLeagues.seasonStartedAt,
      })
    return res.status(200).json({
      leaguePhase: row.leaguePhase,
      seasonStartedAt: row.seasonStartedAt?.toISOString() ?? null,
    })
  } catch (err) {
    logger.error('POST /api/leagues/[id]/start-season failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to start season' })
  }
}
