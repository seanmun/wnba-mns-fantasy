import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import { mnsLeagues, mnsPlayers, mnsTeamOwners, mnsTeams } from '../../../src/lib/db/schema.js'
import { capUsed, rosterSpots } from '../../../src/lib/season/roster.js'
import { teamFees } from '../../../src/lib/season/fees.js'
import { logger } from '../../_logger.js'
import type { LeagueConfig } from '../../../src/types/leagueConfig.js'

// What a team owes the league, itemised — the legacy app's roster-and-
// fees card. Two kinds of money meet here: flat dues and charges
// already booked to the ledger (redshirt, activation, franchise tags),
// plus cap dues computed live from where the roster sits right now.
// Tracked, never handled.
//
// GET /api/leagues/:id/fees?teamId= (defaults to the caller's team)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
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
    const teamId = String(req.query.teamId ?? mine?.teamId ?? '')
    if (!teamId) return res.status(400).json({ error: "You don't own a team here — name one with ?teamId." })

    const players = await db
      .select()
      .from(mnsPlayers)
      .where(eq(mnsPlayers.leagueId, leagueId))
    const ledger = await teamFees(db, leagueId, teamId, league.seasonYear)

    const used = capUsed(players, teamId)
    const cap = config.cap?.enabled ? config.cap : null
    const f = config.fees ?? {
      buyIn: 0,
      firstApronFee: 0,
      franchiseTagFee: 0,
      redshirtFee: 0,
      activationFee: 0,
      penaltyRatePerM: 0,
    }

    const overSecond = cap ? Math.max(0, used - cap.secondApron) : 0
    const secondApronPenalty = Math.ceil(overSecond / 1_000_000) * (f.penaltyRatePerM ?? 0)
    const firstApronFee = cap && used > cap.firstApron ? f.firstApronFee ?? 0 : 0
    const redshirtFees = Number(ledger?.redshirtFees ?? 0)
    const activationFees = Number(ledger?.unredshirtFees ?? 0)
    const franchiseTagFees = Number(ledger?.franchiseTagFees ?? 0)

    const redshirts = players.filter((p) => p.teamId === teamId && p.slot === 'redshirt')
    const stashes = players.filter((p) => p.teamId === teamId && p.slot === 'international')
    const activationCount = f.activationFee ? Math.round(activationFees / f.activationFee) : 0
    const redshirtCount = f.redshirtFee ? Math.round(redshirtFees / f.redshirtFee) : 0
    const tagCount = f.franchiseTagFee ? Math.round(franchiseTagFees / f.franchiseTagFee) : 0

    const lines = [
      { label: 'Buy-in fee', amount: f.buyIn ?? 0, note: null as string | null },
      {
        label: 'Franchise tags',
        amount: franchiseTagFees,
        note: tagCount > 1 ? `${tagCount} × $${f.franchiseTagFee}` : null,
      },
      {
        label: 'Redshirt fee',
        amount: redshirtFees,
        note: redshirtCount > 1 ? `${redshirtCount} × $${f.redshirtFee}` : null,
      },
      {
        label: 'Redshirt activation fee',
        amount: activationFees,
        note: activationCount > 0 ? `$${f.activationFee} each` : null,
      },
      { label: 'First apron fee', amount: firstApronFee, note: 'one-time' },
      {
        label: 'Second apron penalty',
        amount: secondApronPenalty,
        note: overSecond > 0 ? `$${f.penaltyRatePerM} per $1M over` : null,
      },
    ].filter((l) => l.amount > 0)

    return res.status(200).json({
      teamId,
      seasonYear: league.seasonYear,
      roster: {
        used: rosterSpots(players, teamId).length,
        size: config.roster?.activeSize ?? 10,
        redshirts: redshirts.length,
        intStash: stashes.length,
        ir: players.filter((p) => p.teamId === teamId && p.slot === 'ir').length,
      },
      capUsed: used,
      lines,
      total: lines.reduce((n, l) => n + l.amount, 0),
      ledger: (ledger?.feeTransactions ?? []) as Array<Record<string, unknown>>,
    })
  } catch (err) {
    logger.error('GET /api/leagues/[id]/fees failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to load fees' })
  }
}
