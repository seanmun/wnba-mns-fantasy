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


export type StatRange = 'season' | 'last30' | 'last10' | 'lastSeason'

// All four research windows in ONE pass over the lines: this calendar
// year's season, the trailing 30 and 10 days, and last calendar year
// (empty until a league carries history — the UI hides it then).
export async function averagesForRanges(
  db: Db,
  leagueId: string,
  now = new Date()
): Promise<Record<StatRange, Record<string, SeasonAvg>>> {
  const rows = (await db
    .select({
      playerId: mnsPlayerStatLines.playerId,
      date: mnsPlayerStatLines.date,
      min: mnsPlayerStatLines.min,
      pts: mnsPlayerStatLines.pts,
      reb: mnsPlayerStatLines.reb,
      ast: mnsPlayerStatLines.ast,
      stl: mnsPlayerStatLines.stl,
      blk: mnsPlayerStatLines.blk,
      tpm: mnsPlayerStatLines.tpm,
      fgm: mnsPlayerStatLines.fgm,
      fga: mnsPlayerStatLines.fga,
    })
    .from(mnsPlayerStatLines)
    .where(eq(mnsPlayerStatLines.leagueId, leagueId))) as Array<{
    playerId: string
    date: string
    min: number
    pts: number
    reb: number
    ast: number
    stl: number
    blk: number
    tpm: number
    fgm: number
    fga: number
  }>

  const day = (offset: number) =>
    new Date(now.getTime() - offset * 86400000).toISOString().slice(0, 10)
  const year = String(now.getFullYear())
  const cut30 = day(30)
  const cut10 = day(10)

  type Acc = { gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; tpm: number; fgm: number; fga: number }
  const zero = (): Acc => ({ gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0, fgm: 0, fga: 0 })
  const buckets: Record<StatRange, Map<string, Acc>> = {
    season: new Map(),
    last30: new Map(),
    last10: new Map(),
    lastSeason: new Map(),
  }
  const add = (m: Map<string, Acc>, r: (typeof rows)[number]) => {
    const a = m.get(r.playerId) ?? zero()
    if (r.min > 0) a.gp++
    a.pts += r.pts; a.reb += r.reb; a.ast += r.ast; a.stl += r.stl
    a.blk += r.blk; a.tpm += r.tpm; a.fgm += r.fgm; a.fga += r.fga
    m.set(r.playerId, a)
  }
  for (const r of rows) {
    if (r.date.startsWith(year)) {
      add(buckets.season, r)
      if (r.date >= cut30) add(buckets.last30, r)
      if (r.date >= cut10) add(buckets.last10, r)
    } else if (r.date.startsWith(String(now.getFullYear() - 1))) {
      add(buckets.lastSeason, r)
    }
  }

  const per = (v: number, gp: number) => (gp > 0 ? Math.round((v / gp) * 10) / 10 : 0)
  const finish = (m: Map<string, Acc>): Record<string, SeasonAvg> => {
    const out: Record<string, SeasonAvg> = {}
    for (const [id, a] of m) {
      if (a.gp === 0 && a.fga === 0) continue
      out[id] = {
        gp: a.gp,
        ppg: per(a.pts, a.gp),
        rpg: per(a.reb, a.gp),
        apg: per(a.ast, a.gp),
        spg: per(a.stl, a.gp),
        bpg: per(a.blk, a.gp),
        tpg: per(a.tpm, a.gp),
        fgPct: a.fga > 0 ? Math.round((a.fgm / a.fga) * 1000) / 10 : 0,
      }
    }
    return out
  }
  return {
    season: finish(buckets.season),
    last30: finish(buckets.last30),
    last10: finish(buckets.last10),
    lastSeason: finish(buckets.lastSeason),
  }
}
