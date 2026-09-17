import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_middleware.js'
import { CODE_ALIAS, ESPN_SCOREBOARD } from '../src/lib/season/statSources.js'
import { easternToday } from '../src/lib/season/score.js'
import { logger } from './_logger.js'

// The real WNBA scoreboard, proxied so the browser never talks to ESPN
// and team codes match the ones on every roster. League-agnostic on
// purpose — scores are the same in every league.
//
// GET /api/scores?date=YYYY-MM-DD (defaults to Eastern today)
// GET /api/scores?event=ID — one game's box score, both teams
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const today = easternToday()
  let date = String(req.query.date ?? today)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today

  try {
    // One game's box, parsed the same way ingest reads it.
    if (req.query.event) {
      const eventId = String(req.query.event).replace(/[^0-9]/g, '')
      const summary = (await (
        await fetch(`${ESPN_SCOREBOARD.replace('/scoreboard', '/summary')}?event=${eventId}`)
      ).json()) as {
        boxscore?: {
          players?: Array<{
            team?: { abbreviation?: string; shortDisplayName?: string }
            statistics?: Array<{
              names: string[]
              athletes: Array<{
                athlete: { displayName: string; shortName?: string }
                stats: string[]
              }>
            }>
          }>
        }
      }
      const teams = (summary.boxscore?.players ?? []).map((teamBox) => {
        const stats = teamBox.statistics?.[0]
        const col = (n: string) => stats?.names.indexOf(n) ?? -1
        const at = (row: string[], i: number) => (i >= 0 ? row[i] ?? '0' : '0')
        const idx = {
          min: col('MIN'), pts: col('PTS'), reb: col('REB'), ast: col('AST'),
          fg: col('FG'), stl: col('STL'), blk: col('BLK'), to: col('TO'),
        }
        const abbr = teamBox.team?.abbreviation ?? ''
        return {
          code: CODE_ALIAS[abbr] ?? abbr,
          name: teamBox.team?.shortDisplayName ?? '',
          players: (stats?.athletes ?? [])
            .filter((a) => a.stats && a.stats.length > 0)
            .map((a) => ({
              name: a.athlete.shortName ?? a.athlete.displayName,
              min: at(a.stats, idx.min),
              pts: at(a.stats, idx.pts),
              reb: at(a.stats, idx.reb),
              ast: at(a.stats, idx.ast),
              fg: at(a.stats, idx.fg),
              stl: at(a.stats, idx.stl),
              blk: at(a.stats, idx.blk),
              to: at(a.stats, idx.to),
            })),
        }
      })
      return res.status(200).json({ id: eventId, teams })
    }

    const board = (await (
      await fetch(`${ESPN_SCOREBOARD}?dates=${date.replace(/-/g, '')}`)
    ).json()) as {
      events?: Array<{
        id: string
        date: string
        status: { type: { state: string; shortDetail?: string; detail?: string } }
        competitions?: Array<{
          competitors?: Array<{
            homeAway: string
            score?: string
            team: { abbreviation: string; shortDisplayName?: string }
          }>
        }>
      }>
    }

    const games = (board.events ?? []).map((e) => {
      const comps = e.competitions?.[0]?.competitors ?? []
      const pick = (ha: string) => {
        const c = comps.find((x) => x.homeAway === ha)
        return {
          code: c ? CODE_ALIAS[c.team.abbreviation] ?? c.team.abbreviation : '',
          name: c?.team.shortDisplayName ?? '',
          score: Number(c?.score ?? 0),
        }
      }
      return {
        id: e.id,
        tip: e.date,
        state: (e.status.type.state as 'pre' | 'in' | 'post') ?? 'pre',
        detail: e.status.type.shortDetail ?? e.status.type.detail ?? '',
        home: pick('home'),
        away: pick('away'),
      }
    })

    return res.status(200).json({ date, today, games })
  } catch (err) {
    logger.error('GET /api/scores failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Scores are unavailable right now.' })
  }
}
