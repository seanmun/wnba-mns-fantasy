import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { verifyAuth } from '../../../_middleware.js'
import { db } from '../../../_db.js'
import { mnsPlayers } from '../../../../src/lib/db/schema.js'
import { logger } from '../../../_logger.js'
import type { Player, ExternalIds, RookieDraftInfo, MigrationSource, PlayerSlot } from '../../../../src/types/player.js'
import type { Sport } from '../../../../src/types/leagueConfig.js'

function mapPlayerRow(row: typeof mnsPlayers.$inferSelect): Player {
  return {
    id: row.id,
    externalIds: (row.externalIds ?? {}) as ExternalIds,
    name: row.name,
    position: row.position,
    salary: row.salary,
    teamCode: row.teamCode,
    leagueId: row.leagueId ?? '',
    teamId: row.teamId,
    sport: row.sport as Sport,
    slot: row.slot as PlayerSlot,
    onIR: row.onIR,
    isRookie: row.isRookie,
    isInternationalStash: row.isInternationalStash,
    intEligible: row.intEligible,
    rookieDraftInfo: (row.rookieDraftInfo ?? null) as RookieDraftInfo | null,
    keeperPriorYearRound: row.keeperPriorYearRound,
    keeperDerivedBaseRound: row.keeperDerivedBaseRound,
    migratedKeeperRound: row.migratedKeeperRound,
    migrationSource: (row.migrationSource ?? null) as MigrationSource | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
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
    const rows = await db
      .select()
      .from(mnsPlayers)
      .where(eq(mnsPlayers.leagueId, leagueId))
      .orderBy(mnsPlayers.salary)

    // Sort by salary desc (drizzle order by asc by default for bigint;
    // we want highest first)
    const sorted = [...rows].sort((a, b) => Number(b.salary) - Number(a.salary))
    return res.status(200).json(sorted.map(mapPlayerRow))
  } catch (err) {
    logger.error('GET /api/leagues/[id]/players failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to load players' })
  }
}
