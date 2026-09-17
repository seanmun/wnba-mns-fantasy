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
import { logTransaction } from '../../../src/lib/season/waivers.js'
import { effectiveSlots, isLockedDate, setSlotForDate, shiftDate } from '../../../src/lib/season/lineups.js'
import { easternToday } from '../../../src/lib/season/score.js'

// Roster slots, an OWNER act: move your own players between Active,
// Bench and IR — for a DATE. Only ACTIVE players score, judged per
// date. Past dates are locked history; today and future dates are
// editable, and a slot set ahead carries forward once its day arrives.
// IR is capped by config.roster.irSlots. 'drop' is immediate (always
// today): the player hits free agency now.
//
// POST /api/leagues/:id/roster { playerId, slot: 'active'|'bench'|'ir'|'drop', date? }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
  const playerId = String(req.body?.playerId ?? '')
  const slot = String(req.body?.slot ?? '')
  if (!playerId || !['active', 'bench', 'ir', 'drop'].includes(slot)) {
    return res.status(400).json({ error: 'playerId and a slot (active, bench, ir, drop) are required.' })
  }
  const today = easternToday()
  const date = String(req.body?.date ?? today)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD.' })
  }
  if (isLockedDate(date)) {
    return res.status(400).json({ error: 'That day is over — past lineups are locked.' })
  }
  if (date > shiftDate(today, 13)) {
    return res.status(400).json({ error: 'Lineups can be set up to two weeks ahead.' })
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
      // The cap is judged against the lineup of the date being edited.
      const irCap = config.roster?.irSlots ?? 3
      const dated = await effectiveSlots(db, leagueId, mine.teamId, date)
      const irCount = [...dated.entries()].filter(([id, s]) => s === 'ir' && id !== playerId).length
      if (irCount >= irCap) {
        return res.status(400).json({ error: `IR is full — this league allows ${irCap}.` })
      }
    }

    if (slot === 'drop') {
      // A straight drop: the player hits free agency now, the roster
      // runs short, and the hole is filled add-only from the wire.
      await db
        .update(mnsPlayers)
        .set({ teamId: null, slot: 'active', onIR: false })
        .where(and(eq(mnsPlayers.leagueId, leagueId), eq(mnsPlayers.id, playerId)))
      await logTransaction(db, leagueId, 'add_drop', [mine.teamId], {
        dropped: player.name,
      })
      return res.status(200).json({ ok: true, playerId, dropped: true })
    }

    await setSlotForDate(
      db,
      leagueId,
      mine.teamId,
      playerId,
      slot as 'active' | 'bench' | 'ir',
      date,
      userId
    )

    return res.status(200).json({ ok: true, playerId, slot, date })
  } catch (err) {
    logger.error('roster endpoint failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Roster move failed. Try again.' })
  }
}
