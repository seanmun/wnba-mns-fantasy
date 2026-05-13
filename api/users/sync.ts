import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_middleware.js'
import { db } from '../_db.js'
import { users } from '../../src/lib/db/schema.js'
import { userSyncSchema, parseBody } from '../_validation.js'
import { logger } from '../_logger.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const userId = await verifyAuth(req)
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const parsed = parseBody(userSyncSchema, req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error })
  }

  const { email, displayName, avatarUrl } = parsed.data
  const avatar = avatarUrl ?? null

  try {
    await db
      .insert(users)
      .values({ id: userId, email, displayName, avatarUrl: avatar })
      .onConflictDoUpdate({
        target: users.id,
        set: { email, displayName, avatarUrl: avatar, updatedAt: new Date() },
      })
    return res.status(200).json({ success: true })
  } catch (err: unknown) {
    logger.error('users/sync failed', {
      userId,
      email,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Sync failed' })
  }
}
