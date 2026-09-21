import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import { averagesForRanges } from '../../../src/lib/season/stats.js'
import { logger } from '../../_logger.js'

// GET /api/leagues/:id/stats — per-player averages for every research
// window at once (season, last 30 days, last 10 days, last season), so
// the client flips ranges instantly. lastSeason comes back null when
// no prior-year lines exist.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
  try {
    const ranges = await averagesForRanges(db, leagueId)
    return res.status(200).json({
      season: ranges.season,
      last30: ranges.last30,
      last10: ranges.last10,
      lastSeason: Object.keys(ranges.lastSeason).length > 0 ? ranges.lastSeason : null,
    })
  } catch (err) {
    logger.error('GET /api/leagues/[id]/stats failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to load stats' })
  }
}
