import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { db } from '../_db.js'
import { mnsLeagues } from '../../src/lib/db/schema.js'
import { logger } from '../_logger.js'
import { ingestEspnDay, ingestSimDay } from '../../src/lib/season/statSources.js'
import { easternToday, matchupWeekFor, scoreLeagueWeek } from '../../src/lib/season/score.js'
import type { LeagueConfig } from '../../src/types/leagueConfig.js'

// The season heartbeat, hourly. For every league in its regular season:
// ingest yesterday's and today's stat lines (yesterday again because
// late finals and ESPN corrections land after midnight), then rescore
// the affected weeks. Scoring is a full recompute, so running this
// twice — or after a correction — always lands on the same answer.
//
// The stat source is per-league config (season.statSource): 'sim' keeps
// a test season alive through the FIBA break; 'espn' is the real thing.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers['authorization']
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = new Date()
  const today = easternToday(now)
  const yesterday = easternToday(new Date(now.getTime() - 24 * 3600 * 1000))

  const leagues = await db
    .select()
    .from(mnsLeagues)
    .where(eq(mnsLeagues.leaguePhase, 'regular_season'))

  const report: Array<Record<string, unknown>> = []
  for (const league of leagues) {
    try {
      const config = league.config as LeagueConfig
      const source =
        (config.season as { statSource?: string }).statSource === 'sim' ? 'sim' : 'espn'

      const days = [yesterday, today]
      let written = 0
      const unmatched: string[] = []
      for (const day of days) {
        // Only ingest days inside the season — the simulator would
        // happily invent games in the offseason.
        const week = await matchupWeekFor(db, league.id, day)
        if (week == null) continue
        if (source === 'sim') {
          written += (await ingestSimDay(db, league.id, day)).written
        } else {
          const r = await ingestEspnDay(db, league.id, day)
          written += r.written
          unmatched.push(...r.unmatched)
        }
      }

      const weeks = new Set<number>()
      for (const day of days) {
        const w = await matchupWeekFor(db, league.id, day)
        if (w != null) weeks.add(w)
      }
      let scored = 0
      let finalized = 0
      for (const w of weeks) {
        const r = await scoreLeagueWeek(db, league.id, config, w, now)
        scored += r.scored
        finalized += r.finalized
      }

      if (unmatched.length) {
        logger.error('season-tick: unmatched ESPN names', {
          leagueId: league.id,
          unmatched: [...new Set(unmatched)].slice(0, 30),
        })
      }
      report.push({
        league: league.name,
        source,
        linesWritten: written,
        matchupsScored: scored,
        finalized,
        unmatched: [...new Set(unmatched)].length,
      })
    } catch (err) {
      logger.error('season-tick failed for league', {
        leagueId: league.id,
        err: err instanceof Error ? err.message : String(err),
      })
      report.push({ league: league.name, failed: String(err) })
    }
  }

  return res.status(200).json({ ok: true, today, leagues: report })
}
