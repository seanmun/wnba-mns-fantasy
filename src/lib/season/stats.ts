import { eq, sql } from 'drizzle-orm'
import { mnsPlayerStatLines } from '../db/schema.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface SeasonAvg {
  gp: number
  ppg: number
  rpg: number
  apg: number
  spg: number
  bpg: number
  tpg: number
  fgPct: number
}

// Season averages from the real box scores on file — one query, one
// map, shared by every surface that shows a player (wire, team page).
export async function seasonAverages(db: Db, leagueId: string): Promise<Map<string, SeasonAvg>> {
  const agg = await db
    .select({
      playerId: mnsPlayerStatLines.playerId,
      gp: sql<number>`count(*) filter (where ${mnsPlayerStatLines.min} > 0)`,
      pts: sql<number>`coalesce(sum(${mnsPlayerStatLines.pts}), 0)`,
      reb: sql<number>`coalesce(sum(${mnsPlayerStatLines.reb}), 0)`,
      ast: sql<number>`coalesce(sum(${mnsPlayerStatLines.ast}), 0)`,
      stl: sql<number>`coalesce(sum(${mnsPlayerStatLines.stl}), 0)`,
      blk: sql<number>`coalesce(sum(${mnsPlayerStatLines.blk}), 0)`,
      tpm: sql<number>`coalesce(sum(${mnsPlayerStatLines.tpm}), 0)`,
      fgm: sql<number>`coalesce(sum(${mnsPlayerStatLines.fgm}), 0)`,
      fga: sql<number>`coalesce(sum(${mnsPlayerStatLines.fga}), 0)`,
    })
    .from(mnsPlayerStatLines)
    .where(eq(mnsPlayerStatLines.leagueId, leagueId))
    .groupBy(mnsPlayerStatLines.playerId)

  const per = (v: number, gp: number) => (gp > 0 ? Math.round((v / gp) * 10) / 10 : 0)
  return new Map(
    agg.map((a: Record<string, number | string>) => [
      String(a.playerId),
      {
        gp: Number(a.gp),
        ppg: per(Number(a.pts), Number(a.gp)),
        rpg: per(Number(a.reb), Number(a.gp)),
        apg: per(Number(a.ast), Number(a.gp)),
        spg: per(Number(a.stl), Number(a.gp)),
        bpg: per(Number(a.blk), Number(a.gp)),
        tpg: per(Number(a.tpm), Number(a.gp)),
        fgPct: Number(a.fga) > 0 ? Math.round((Number(a.fgm) / Number(a.fga)) * 1000) / 10 : 0,
      },
    ])
  )
}
