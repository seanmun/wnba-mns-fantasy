import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { verifyAuth, canManageLeague } from '../../../_middleware.js'
import { db } from '../../../_db.js'
import { mnsPlayers, mnsTeams } from '../../../../src/lib/db/schema.js'
import { updatePlayerSchema, parseBody } from '../../../_validation.js'
import { logger } from '../../../_logger.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = req.query.id as string | undefined
  const playerId = req.query.playerId as string | undefined
  if (!leagueId || !playerId) {
    return res.status(400).json({ error: 'Missing league id or player id' })
  }

  if (!(await canManageLeague(userId, leagueId))) {
    return res
      .status(403)
      .json({ error: 'Only the commissioner can edit players' })
  }

  const parsed = parseBody(updatePlayerSchema, req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error })

  // If teamId is set, verify the team belongs to this league
  if (parsed.data.teamId) {
    const [team] = await db
      .select({ leagueId: mnsTeams.leagueId })
      .from(mnsTeams)
      .where(eq(mnsTeams.id, parsed.data.teamId))
      .limit(1)
    if (!team || team.leagueId !== leagueId) {
      return res.status(400).json({ error: 'Team does not belong to this league' })
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.teamId !== undefined) updates.teamId = parsed.data.teamId
  if (parsed.data.slot !== undefined) updates.slot = parsed.data.slot
  if (parsed.data.position !== undefined) updates.position = parsed.data.position
  if (parsed.data.keeperPriorYearRound !== undefined)
    updates.keeperPriorYearRound = parsed.data.keeperPriorYearRound
  if (parsed.data.migratedKeeperRound !== undefined)
    updates.migratedKeeperRound = parsed.data.migratedKeeperRound
  if (parsed.data.isRookie !== undefined) updates.isRookie = parsed.data.isRookie
  if (parsed.data.intEligible !== undefined) updates.intEligible = parsed.data.intEligible

  try {
    const result = await db
      .update(mnsPlayers)
      .set(updates)
      .where(and(eq(mnsPlayers.id, playerId), eq(mnsPlayers.leagueId, leagueId)))
      .returning({ id: mnsPlayers.id })
    if (result.length === 0) {
      return res.status(404).json({ error: 'Player not found in this league' })
    }
    return res.status(200).json({ success: true })
  } catch (err) {
    logger.error('PATCH /api/leagues/[id]/players/[playerId] failed', {
      leagueId,
      playerId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to update player' })
  }
}
