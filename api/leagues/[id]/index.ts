import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { verifyAuth, canManageLeague } from '../../_middleware.js'
import { db } from '../../_db.js'
import { mnsLeagues } from '../../../src/lib/db/schema.js'
import { updateLeagueSchema, parseBody } from '../../_validation.js'
import { logger } from '../../_logger.js'
import type { League } from '../../../src/types/league.js'
import type { Sport } from '../../../src/types/leagueConfig.js'
import type { LeaguePhase, ScoringMode } from '../../../src/types/league.js'
import type { LeagueConfig } from '../../../src/types/leagueConfig.js'

function mapLeagueRow(row: typeof mnsLeagues.$inferSelect): League {
  return {
    id: row.id,
    name: row.name,
    seasonYear: row.seasonYear,
    sport: row.sport as Sport,
    gameSlug: row.gameSlug,
    config: row.config,
    leaguePhase: row.leaguePhase as LeaguePhase,
    keepersLocked: row.keepersLocked,
    commissionerId: row.commissionerId,
    scoringMode: row.scoringMode as ScoringMode,
    seasonStartedAt: row.seasonStartedAt?.toISOString() ?? null,
    seasonStartedBy: row.seasonStartedBy,
    telegramChatId: row.telegramChatId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = req.query.id as string | undefined
  if (!leagueId) return res.status(400).json({ error: 'Missing league id' })

  if (req.method === 'GET') return handleGet(res, leagueId)

  if (req.method === 'PATCH') {
    if (!(await canManageLeague(userId, leagueId))) {
      return res
        .status(403)
        .json({ error: 'Only the commissioner can update league settings' })
    }
    return handlePatch(req, res, leagueId)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(res: VercelResponse, leagueId: string) {
  try {
    const [row] = await db
      .select()
      .from(mnsLeagues)
      .where(eq(mnsLeagues.id, leagueId))
      .limit(1)
    if (!row) return res.status(404).json({ error: 'League not found' })
    return res.status(200).json(mapLeagueRow(row))
  } catch (err) {
    logger.error('GET /api/leagues/[id] failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to load league' })
  }
}

async function handlePatch(
  req: VercelRequest,
  res: VercelResponse,
  leagueId: string
) {
  const parsed = parseBody(updateLeagueSchema, req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error })

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.keepersLocked !== undefined) {
    updates.keepersLocked = parsed.data.keepersLocked
  }
  if (parsed.data.config !== undefined) {
    const config = parsed.data.config as LeagueConfig
    updates.config = config
    // Keep denormalized columns in sync with the embedded config.
    if (config.scoring?.mode) updates.scoringMode = config.scoring.mode
  }

  try {
    const [row] = await db
      .update(mnsLeagues)
      .set(updates)
      .where(eq(mnsLeagues.id, leagueId))
      .returning()
    if (!row) return res.status(404).json({ error: 'League not found' })
    return res.status(200).json(mapLeagueRow(row))
  } catch (err) {
    logger.error('PATCH /api/leagues/[id] failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to update league' })
  }
}
