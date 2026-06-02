import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, sql } from 'drizzle-orm'
import { verifyAuth, canManageLeague } from '../../_middleware.js'
import { db } from '../../_db.js'
import {
  mnsTeams,
  mnsTeamOwners,
  users,
} from '../../../src/lib/db/schema.js'
import { createTeamSchema, parseBody } from '../../_validation.js'
import { logger } from '../../_logger.js'
import type { Team, TeamOwner } from '../../../src/types/team.js'

interface TeamWithOwners extends Team {
  owners: TeamOwner[]
}

function mapTeamRow(row: typeof mnsTeams.$inferSelect): Team {
  return {
    id: row.id,
    leagueId: row.leagueId,
    name: row.name,
    abbrev: row.abbrev,
    telegramUsername: row.telegramUsername,
    capAdjustments: row.capAdjustments,
    banners: row.banners,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function mapOwnerRow(row: typeof mnsTeamOwners.$inferSelect): TeamOwner {
  return {
    teamId: row.teamId,
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
  }
}

function generateTeamId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24) || 'team'
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${slug}-${suffix}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = req.query.id as string | undefined
  if (!leagueId) return res.status(400).json({ error: 'Missing league id' })

  if (req.method === 'GET') return handleGet(res, leagueId)

  if (req.method === 'POST') {
    if (!(await canManageLeague(userId, leagueId))) {
      return res.status(403).json({ error: 'Only the commissioner can add teams' })
    }
    return handlePost(req, res, leagueId)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(res: VercelResponse, leagueId: string) {
  try {
    const teamRows = await db
      .select()
      .from(mnsTeams)
      .where(eq(mnsTeams.leagueId, leagueId))
      .orderBy(mnsTeams.createdAt)

    if (teamRows.length === 0) return res.status(200).json([])

    const ownerRows = await db
      .select()
      .from(mnsTeamOwners)
      .where(
        sql`${mnsTeamOwners.teamId} IN (${sql.join(
          teamRows.map((t) => sql`${t.id}`),
          sql`, `
        )})`
      )

    const ownersByTeam = new Map<string, TeamOwner[]>()
    for (const row of ownerRows) {
      const list = ownersByTeam.get(row.teamId) ?? []
      list.push(mapOwnerRow(row))
      ownersByTeam.set(row.teamId, list)
    }

    const result: TeamWithOwners[] = teamRows.map((t) => ({
      ...mapTeamRow(t),
      owners: ownersByTeam.get(t.id) ?? [],
    }))

    return res.status(200).json(result)
  } catch (err) {
    logger.error('GET /api/leagues/[id]/teams failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to load teams' })
  }
}

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  leagueId: string
) {
  const parsed = parseBody(createTeamSchema, req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error })

  const { name, abbrev, ownerEmails, telegramUsername } = parsed.data
  const teamId = generateTeamId(name)
  const now = new Date()

  try {
    const [teamRow] = await db
      .insert(mnsTeams)
      .values({
        id: teamId,
        leagueId,
        name,
        abbrev,
        telegramUsername: telegramUsername ?? null,
      })
      .returning()

    // Look up existing users by email (to link user_id on invite if they
    // already have an account). Pending invites get user_id = null and
    // get linked when they sign in (via api/users/sync).
    const lookup = new Map<string, string>()
    for (const email of ownerEmails) {
      const [existing] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      if (existing) lookup.set(email, existing.id)
    }

    const ownerInserts = ownerEmails.map((email, idx) => ({
      teamId,
      email,
      userId: lookup.get(email) ?? null,
      displayName: null,
      isPrimary: idx === 0,
      createdAt: now,
    }))

    await db.insert(mnsTeamOwners).values(ownerInserts)

    const ownerRows = await db
      .select()
      .from(mnsTeamOwners)
      .where(eq(mnsTeamOwners.teamId, teamId))

    const result: TeamWithOwners = {
      ...mapTeamRow(teamRow),
      owners: ownerRows.map(mapOwnerRow),
    }
    return res.status(201).json(result)
  } catch (err) {
    logger.error('POST /api/leagues/[id]/teams failed', {
      leagueId,
      teamId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to create team' })
  }
}
