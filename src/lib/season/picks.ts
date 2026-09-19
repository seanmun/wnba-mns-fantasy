import { eq } from 'drizzle-orm'
import { mnsFuturePicks, mnsTeams } from '../db/schema.js'
import type { LeagueConfig } from '../../types/leagueConfig.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

// The future pick board: every rookie pick for the next three drafts.
// A pick's identity is (season, round, original team); ownership lives
// in future_picks, absent row = still with its original team. Shared
// by the trade machine (assets) and the roster page (holdings).
export interface FuturePick {
  id: string
  seasonYear: number
  round: number
  originalTeamId: string
  originalTeamName: string
  ownerTeamId: string
  displayName: string
}

export async function pickBoard(
  db: Db,
  league: { id: string; seasonYear: number; config: LeagueConfig }
): Promise<FuturePick[]> {
  const teams = await db.select().from(mnsTeams).where(eq(mnsTeams.leagueId, league.id))
  const teamName = new Map<string, string>(
    teams.map((t: { id: string; name: string }) => [t.id, t.name])
  )
  const overrides = await db
    .select()
    .from(mnsFuturePicks)
    .where(eq(mnsFuturePicks.leagueId, league.id))
  const ownerOf = new Map<string, string>(
    overrides.map((r: { seasonYear: number; round: number; originalTeamId: string; currentTeamId: string }) => [
      `${r.seasonYear}:${r.round}:${r.originalTeamId}`,
      r.currentTeamId,
    ])
  )
  const rounds = league.config.draft?.rookieRounds ?? 3
  const picks: FuturePick[] = []
  for (let y = league.seasonYear + 1; y <= league.seasonYear + 3; y++) {
    for (let r = 1; r <= rounds; r++) {
      for (const t of teams as Array<{ id: string }>) {
        const owner = ownerOf.get(`${y}:${r}:${t.id}`) ?? t.id
        picks.push({
          id: `pick:${y}:r${r}:${t.id}`,
          seasonYear: y,
          round: r,
          originalTeamId: t.id,
          originalTeamName: teamName.get(t.id) ?? t.id,
          ownerTeamId: owner,
          displayName: `${y} Round ${r} pick (via ${teamName.get(t.id) ?? t.id})`,
        })
      }
    }
  }
  return picks
}
