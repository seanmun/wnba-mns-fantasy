import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import {
  mnsLeagues,
  mnsPlayers,
  mnsTeamOwners,
  mnsTeams,
} from '../../../src/lib/db/schema.js'
import { logger } from '../../_logger.js'
import type { LeagueConfig } from '../../../src/types/leagueConfig.js'

// Roster slots, an OWNER act: move your own players between Active,
// Bench and IR. Only ACTIVE players score — in a 9-cat league a hurt
// player drags your ratios, so the bench is a real decision, not
// decoration. IR is capped by config.roster.irSlots.
//
// POST /api/leagues/:id/roster { playerId, slot: 'active'|'bench'|'ir' }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
  const playerId = String(req.body?.playerId ?? '')
  const slot = String(req.body?.slot ?? '')
  if (!playerId || !['active', 'bench', 'ir'].includes(slot)) {
    return res.status(400).json({ error: 'playerId and a slot (active, bench, ir) are required.' })
  }

  try {
    const [league] = await db.select().from(mnsLeagues).where(eq(mnsLeagues.id, leagueId)).limit(1)
    if (!league) return res.status(404).json({ error: 'League not found' })
    const config = league.config as LeagueConfig

    const [mine] = await db
      .select({ teamId: mnsTeamOwners.teamId })
      .from(mnsTeamOwners)
      .innerJoin(mnsTeams, eq(mnsTeams.id, mnsTeamOwners.teamId))
      .where(and(eq(mnsTeams.leagueId, leagueId), eq(mnsTeamOwners.userId, userId)))
      .limit(1)
    if (!mine) return res.status(403).json({ error: "You don't own a team in this league." })

    const [player] = await db
      .select()
      .from(mnsPlayers)
      .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.id, playerId)))
      .limit(1)
    if (!player || player.teamId !== mine.teamId) {
      return res.status(403).json({ error: 'That player is not on your roster.' })
    }

    if (slot === 'ir') {
      const irCap = config.roster?.irSlots ?? 3
      const roster = await db
        .select({ slot: mnsPlayers.slot })
        .from(mnsPlayers)
        .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.teamId, mine.teamId)))
      const irCount = roster.filter((p) => p.slot === 'ir').length
      if (irCount >= irCap) {
        return res.status(400).json({ error: `IR is full — this league allows ${irCap}.` })
      }
    }

    await db
      .update(mnsPlayers)
      .set({ slot, onIR: slot === 'ir' })
      .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.id, playerId)))

    return res.status(200).json({ ok: true, playerId, slot })
  } catch (err) {
    logger.error('roster endpoint failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Roster move failed. Try again.' })
  }
}
