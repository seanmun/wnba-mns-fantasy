import { and, eq, sql } from 'drizzle-orm'
import { mnsTeamFees } from '../db/schema.js'

// League dues the app TRACKS and never handles — same law as the prize
// pot. Redshirting costs a fee; activating one mid-season costs
// another. Each charge appends to the team's ledger so the
// commissioner can settle up from a list, not a memory.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type FeeKind = 'redshirt' | 'unredshirt' | 'franchise_tag'

export interface FeeEntry {
  kind: FeeKind
  amount: number
  detail: string
  at: string
}

export async function chargeFee(
  db: Db,
  leagueId: string,
  teamId: string,
  seasonYear: number,
  kind: FeeKind,
  amount: number,
  detail: string,
  now = new Date()
): Promise<void> {
  if (!amount) return
  const entry: FeeEntry = { kind, amount, detail, at: now.toISOString() }
  const column =
    kind === 'redshirt'
      ? mnsTeamFees.redshirtFees
      : kind === 'unredshirt'
        ? mnsTeamFees.unredshirtFees
        : mnsTeamFees.franchiseTagFees
  await db
    .insert(mnsTeamFees)
    .values({
      id: `${leagueId}_${teamId}_${seasonYear}`,
      leagueId,
      teamId,
      seasonYear,
      ...(kind === 'redshirt' ? { redshirtFees: String(amount) } : {}),
      ...(kind === 'unredshirt' ? { unredshirtFees: String(amount) } : {}),
      ...(kind === 'franchise_tag' ? { franchiseTagFees: String(amount) } : {}),
      totalFees: String(amount),
      feeTransactions: [entry],
    })
    .onConflictDoUpdate({
      target: [mnsTeamFees.leagueId, mnsTeamFees.teamId, mnsTeamFees.seasonYear],
      set: {
        [kind === 'redshirt' ? 'redshirtFees' : kind === 'unredshirt' ? 'unredshirtFees' : 'franchiseTagFees']:
          sql`${column} + ${amount}`,
        totalFees: sql`${mnsTeamFees.totalFees} + ${amount}`,
        feeTransactions: sql`${mnsTeamFees.feeTransactions} || ${JSON.stringify([entry])}::jsonb`,
        updatedAt: now,
      },
    })
}

export async function teamFees(db: Db, leagueId: string, teamId: string, seasonYear: number) {
  const [row] = await db
    .select()
    .from(mnsTeamFees)
    .where(
      and(
        eq(mnsTeamFees.leagueId, leagueId),
        eq(mnsTeamFees.teamId, teamId),
        eq(mnsTeamFees.seasonYear, seasonYear)
      )
    )
    .limit(1)
  return row ?? null
}
