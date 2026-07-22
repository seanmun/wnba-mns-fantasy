import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and, inArray } from 'drizzle-orm'
import { verifyAuth, canManageLeague } from '../../_middleware.js'
import { db } from '../../_db.js'
import { mnsTeams, mnsRookieDraftPicks } from '../../../src/lib/db/schema.js'
import { setRookiePicksSchema, parseBody } from '../../_validation.js'
import { logger } from '../../_logger.js'
import type { RookieDraftPickRow } from '../../../src/types/draft.js'

function mapPickRow(
  row: typeof mnsRookieDraftPicks.$inferSelect
): RookieDraftPickRow {
  return {
    id: row.id,
    leagueId: row.leagueId,
    seasonYear: row.seasonYear,
    round: row.round,
    pickInRound: row.pickInRound,
    overallPick: row.overallPick,
    teamId: row.teamId,
    playerId: row.playerId,
    playerName: row.playerName,
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

  if (req.method === 'PUT') {
    if (!(await canManageLeague(userId, leagueId))) {
      return res
        .status(403)
        .json({ error: 'Only the commissioner can set rookie picks' })
    }
    return handlePut(req, res, leagueId)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(res: VercelResponse, leagueId: string) {
  try {
    const rows = await db
      .select()
      .from(mnsRookieDraftPicks)
      .where(eq(mnsRookieDraftPicks.leagueId, leagueId))
      .orderBy(mnsRookieDraftPicks.seasonYear, mnsRookieDraftPicks.overallPick)
    return res.status(200).json(rows.map(mapPickRow))
  } catch (err) {
    logger.error('GET /api/leagues/[id]/rookie-picks failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to load rookie picks' })
  }
}

async function handlePut(
  req: VercelRequest,
  res: VercelResponse,
  leagueId: string
) {
  const parsed = parseBody(setRookiePicksSchema, req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error })

  const { seasonYear, rounds, teamOrder } = parsed.data

  try {
    const leagueTeams = await db
      .select({ id: mnsTeams.id })
      .from(mnsTeams)
      .where(
        and(eq(mnsTeams.leagueId, leagueId), inArray(mnsTeams.id, teamOrder))
      )
    if (leagueTeams.length !== teamOrder.length) {
      const known = new Set(leagueTeams.map((t) => t.id))
      const bad = teamOrder.filter((id) => !known.has(id))
      return res
        .status(400)
        .json({ error: `Teams not in this league: ${bad.join(', ')}` })
    }

    const existing = await db
      .select({ id: mnsRookieDraftPicks.id, playerId: mnsRookieDraftPicks.playerId })
      .from(mnsRookieDraftPicks)
      .where(
        and(
          eq(mnsRookieDraftPicks.leagueId, leagueId),
          eq(mnsRookieDraftPicks.seasonYear, seasonYear)
        )
      )
    if (existing.some((p) => p.playerId !== null)) {
      return res.status(409).json({
        error:
          'Rookie picks for this season already have players selected — the board cannot be regenerated.',
      })
    }

    const now = new Date()
    const suffix = Math.random().toString(36).slice(2, 8)
    const inserts = []
    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < teamOrder.length; i++) {
        const pickInRound = i + 1
        inserts.push({
          id: `rk-${seasonYear}-${round}-${pickInRound}-${suffix}`,
          leagueId,
          seasonYear,
          round,
          pickInRound,
          overallPick: (round - 1) * teamOrder.length + pickInRound,
          teamId: teamOrder[i],
          playerId: null,
          playerName: null,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    if (existing.length > 0) {
      await db
        .delete(mnsRookieDraftPicks)
        .where(
          and(
            eq(mnsRookieDraftPicks.leagueId, leagueId),
            eq(mnsRookieDraftPicks.seasonYear, seasonYear)
          )
        )
    }
    const rows = await db.insert(mnsRookieDraftPicks).values(inserts).returning()
    rows.sort((a, b) => a.overallPick - b.overallPick)
    return res.status(200).json(rows.map(mapPickRow))
  } catch (err) {
    logger.error('PUT /api/leagues/[id]/rookie-picks failed', {
      leagueId,
      seasonYear,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to set rookie picks' })
  }
}
