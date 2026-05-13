import { verifyToken } from '@clerk/backend'
import type { VercelRequest } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { db } from './_db.js'
import { users, wnbaLeagues, wnbaTeamOwners } from '../src/lib/db/schema.js'

export async function verifyAuth(req: VercelRequest): Promise<string | null> {
  try {
    const header = req.headers.authorization
    if (!header) return null
    const token = header.startsWith('Bearer ') ? header.slice(7) : header
    if (!token) return null
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) return null
    const payload = await verifyToken(token, { secretKey })
    return payload.sub ?? null
  } catch {
    return null
  }
}

export async function isSiteAdmin(userId: string): Promise<boolean> {
  const envAdmins = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (envAdmins.includes(userId)) return true

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row?.role === 'admin'
}

export async function isCommissioner(userId: string, leagueId: string): Promise<boolean> {
  const [row] = await db
    .select({ commissionerId: wnbaLeagues.commissionerId })
    .from(wnbaLeagues)
    .where(eq(wnbaLeagues.id, leagueId))
    .limit(1)
  return row?.commissionerId === userId
}

export async function isTeamOwner(userId: string, teamId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: wnbaTeamOwners.userId })
    .from(wnbaTeamOwners)
    .where(and(eq(wnbaTeamOwners.teamId, teamId), eq(wnbaTeamOwners.userId, userId)))
    .limit(1)
  return !!row
}

export async function canManageLeague(userId: string, leagueId: string): Promise<boolean> {
  if (await isSiteAdmin(userId)) return true
  return isCommissioner(userId, leagueId)
}

export async function canEditTeam(userId: string, teamId: string, leagueId: string): Promise<boolean> {
  if (await isSiteAdmin(userId)) return true
  if (await isCommissioner(userId, leagueId)) return true
  return isTeamOwner(userId, teamId)
}
