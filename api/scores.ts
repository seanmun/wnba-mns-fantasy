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
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const today = easternToday()
  let date = String(req.query.date ?? today)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today

  try {
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
