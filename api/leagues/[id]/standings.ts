import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import { mnsTeamOwners, mnsTeams } from '../../../src/lib/db/schema.js'
import { computeStandings } from '../../../src/lib/season/score.js'
import { logger } from '../../_logger.js'

// GET /api/leagues/:id/standings — teams with banked records from
// FINAL matchup weeks. pointsFor = total category wins, the tiebreak.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
  try {
    const teams = await db
      .select()
      .from(mnsTeams)
      .where(eq(mnsTeams.leagueId, leagueId))
    const owners = await db
      .select()
      .from(mnsTeamOwners)
    const ownersByTeam = new Map<string, typeof owners>()
    for (const o of owners) {
      if (!teams.some((t) => t.id === o.teamId)) continue
      const list = ownersByTeam.get(o.teamId) ?? []
      list.push(o)
      ownersByTeam.set(o.teamId, list)
    }

    const rec = await computeStandings(db, leagueId)
    const rows = teams.map((t) => {
      const r = rec.get(t.id) ?? { wins: 0, losses: 0, ties: 0, pointsFor: 0 }
      return {
        id: t.id,
        name: t.name,
        owners: (ownersByTeam.get(t.id) ?? []).map((o) => ({
          userId: o.userId,
          displayName: o.displayName,
          email: o.email,
        })),
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        pointsFor: r.pointsFor,
      }
    })
    return res.status(200).json(rows)
  } catch (err) {
    logger.error('GET /api/leagues/[id]/standings failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to load standings' })
  }
}
