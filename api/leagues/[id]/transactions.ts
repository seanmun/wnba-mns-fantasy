import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, sql } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import { mnsTeams, mnsTransactions } from '../../../src/lib/db/schema.js'
import { logger } from '../../_logger.js'

// GET /api/leagues/:id/transactions — every roster move with a clock
// on it, newest first: instant pickups, waiver grants, trades.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
  try {
    const teams = await db.select().from(mnsTeams).where(eq(mnsTeams.leagueId, leagueId))
    const teamName = new Map(teams.map((t) => [t.id, t.name]))
    const rows = await db
      .select()
      .from(mnsTransactions)
      .where(eq(mnsTransactions.leagueId, leagueId))
      .orderBy(sql`${mnsTransactions.createdAt} desc`)
      .limit(100)
    return res.status(200).json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        teamNames: (r.teamIds as string[]).map((t) => teamName.get(t) ?? t),
        detail: r.detail,
        at: r.createdAt,
      }))
    )
  } catch (err) {
    logger.error('transactions endpoint failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Could not load transactions.' })
  }
}
