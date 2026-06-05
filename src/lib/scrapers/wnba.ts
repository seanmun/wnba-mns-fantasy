// WNBA player pool scraper. Ports the working logic from
// mns/supabase/functions/scrape-wnba-players (Deno) to a Node-compatible
// module. Three sources combined:
//
//   1. HHS salary-cap-sheet JSON     — rich stats + salary, excludes
//                                      rookies without prior-season stats
//   2. HHS team pages (per team)     — every contracted player including
//                                      rookies, salary + UFA/RFA status
//   3. BallDontLie API (optional)    — position, height, college
//
// Returns one merged record per player. No DB, no auth — caller decides
// where to write the result.

const TEAM_MAP: Record<string, string> = {
  ATL: 'ATL', CHI: 'CHI', CON: 'CON', DAL: 'DAL', GSV: 'GSV',
  IND: 'IND', LVA: 'LVA', LAS: 'LAS', MIN: 'MIN', NYL: 'NYL',
  PHO: 'PHO', SEA: 'SEA', WAS: 'WAS',
  NY: 'NYL', LV: 'LVA', LA: 'LAS', GS: 'GSV',
  CT: 'CON', PHX: 'PHO', CONN: 'CON',
}

function normalizeTeam(raw: string): string {
  const upper = raw.trim().toUpperCase()
  return TEAM_MAP[upper] ?? upper
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

export function slugify(name: string): string {
  return decodeHtmlEntities(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim()
}

interface HHSJsonRow {
  _name: string
  team_abbrev: string
  salary: number
  gp: number
  pts_per_game: number
  trb_per_game: number
  ast_per_game: number
  stl_per_game: number
  blk_s_per_game: number
  fg_pct: number
  fg3m_pct: number
  ft_pct: number
}

async function scrapeHhsJson(year: number): Promise<Map<string, HHSJsonRow>> {
  const statsYear = year - 1
  const url = `https://herhoopstats.com/salary-cap-sheet/wnba/players/salary_${year}/stats_${statsYear}/`
  const res = await fetch(url, { headers: { 'User-Agent': 'MNS-FantasyApp/1.0' } })
  if (!res.ok) throw new Error(`HHS JSON returned ${res.status}`)
  const html = await res.text()

  const marker = "JSON.parse('"
  const startIdx = html.indexOf(marker)
  if (startIdx === -1) throw new Error('Could not find JSON.parse marker')
  const jsonStart = startIdx + marker.length
  const jsonEnd = html.indexOf("')", jsonStart)
  if (jsonEnd === -1) throw new Error('Could not find JSON.parse end')

  const raw = html.substring(jsonStart, jsonEnd)
  let jsonStr = raw
  if (raw.includes('\\\\u00')) {
    jsonStr = raw.replace(/\\\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    jsonStr = jsonStr.replace(/\\\\/g, '\\')
  } else if (raw.includes('\\u00')) {
    jsonStr = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  }

  const players = JSON.parse(jsonStr) as Record<string, unknown>[]
  const out = new Map<string, HHSJsonRow>()
  for (const p of players) {
    const name =
      (p.full_name as string) ||
      `${(p.first_name as string) ?? ''} ${(p.last_name as string) ?? ''}`.trim()
    if (!name) continue
    out.set(normalizeName(name), {
      _name: name,
      team_abbrev: (p.team_abbrev as string) ?? '',
      salary: Number(p.cap_hit_salary_year) || 0,
      gp: Number(p.gp) || 0,
      pts_per_game: Number(p.pts_per_game) || 0,
      trb_per_game: Number(p.trb_per_game) || 0,
      ast_per_game: Number(p.ast_per_game) || 0,
      stl_per_game: Number(p.stl_per_game) || 0,
      blk_s_per_game: Number(p.blk_s_per_game) || 0,
      fg_pct: Number(p.fg_pct) || 0,
      fg3m_pct: Number(p.fg3m_pct) || 0,
      ft_pct: Number(p.ft_pct) || 0,
    })
  }
  return out
}

const SLUG_TO_ABBREV: Record<string, string> = {
  'atlanta-dream': 'ATL',
  'chicago-sky': 'CHI',
  'connecticut-sun': 'CON',
  'dallas-wings': 'DAL',
  'golden-state-valkyries': 'GSV',
  'indiana-fever': 'IND',
  'las-vegas-aces': 'LVA',
  'los-angeles-sparks': 'LAS',
  'minnesota-lynx': 'MIN',
  'new-york-liberty': 'NYL',
  'phoenix-mercury': 'PHO',
  'portland-fire': 'POR',
  'seattle-storm': 'SEA',
  'toronto-tempo': 'TOR',
  'washington-mystics': 'WAS',
}

function baseSlug(value: string): string {
  return value.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, '')
}

interface HHSTeamRow {
  _name: string
  team_abbrev: string
  salary: number
  status: string | null
}

async function discoverTeamSlugs(year: number): Promise<{ slugs: string[]; seedSlug: string; seedHtml: string }> {
  const seedSlug = 'dallas-wings-11eaecc7-3583-13fc-b611-2362f5011b0b'
  const seedUrl = `https://herhoopstats.com/salary-cap-sheet/wnba/team/${year}/${seedSlug}/`
  const res = await fetch(seedUrl, { headers: { 'User-Agent': 'MNS-FantasyApp/1.0' } })
  if (!res.ok) throw new Error(`Failed to discover team slugs: HTTP ${res.status}`)
  const seedHtml = await res.text()
  const optionRe = /<option\s+value="([a-z-]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})">/g
  const slugs: string[] = []
  let m: RegExpExecArray | null
  while ((m = optionRe.exec(seedHtml)) !== null) slugs.push(m[1])
  return { slugs: [...new Set(slugs)], seedSlug, seedHtml }
}

function parseTeamPage(html: string, teamAbbrev: string): HHSTeamRow[] {
  const players: HHSTeamRow[] = []
  const rowRe = /<td\s+sorttable_customkey="([^"]+)"\s+class="roster_stat_cell table_cell_left salary_player_name">([\s\S]*?)(?=<td[^>]*salary_player_name|<\/tbody>)/g
  let match: RegExpExecArray | null
  while ((match = rowRe.exec(html)) !== null) {
    const name = decodeHtmlEntities(match[1].trim())
    const rowHtml = match[2]
    const salaryMatch = rowHtml.match(
      /<td[^>]*sorttable_customkey="(\d+)"[^>]*class="roster_stat_cell table_cell_right salary_cap_hit[^"]*"/
    )
    const salary = salaryMatch ? parseInt(salaryMatch[1], 10) : 0
    const statusMatch = rowHtml.match(
      /class="roster_stat_cell table_cell_right salary_unsigned_status"[^>]*title="([^"]+)"/
    )
    const status = statusMatch ? statusMatch[1] : null
    players.push({ _name: name, team_abbrev: teamAbbrev, salary, status })
  }
  return players
}

async function scrapeHhsTeams(year: number): Promise<Map<string, HHSTeamRow>> {
  const out = new Map<string, HHSTeamRow>()
  const { slugs, seedSlug, seedHtml } = await discoverTeamSlugs(year)

  const seedBase = baseSlug(seedSlug)
  const seedAbbrev = SLUG_TO_ABBREV[seedBase] ?? seedBase.toUpperCase()
  for (const p of parseTeamPage(seedHtml, seedAbbrev)) {
    out.set(normalizeName(p._name), p)
  }

  for (const slug of slugs) {
    if (slug === seedSlug) continue
    const base = baseSlug(slug)
    const teamAbbrev = SLUG_TO_ABBREV[base] ?? base.toUpperCase()
    const url = `https://herhoopstats.com/salary-cap-sheet/wnba/team/${year}/${slug}/`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'MNS-FantasyApp/1.0' } })
      if (!res.ok) continue
      const html = await res.text()
      for (const p of parseTeamPage(html, teamAbbrev)) {
        out.set(normalizeName(p._name), p)
      }
    } catch {
      // skip team on error
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  return out
}

interface BdlPlayer {
  first_name: string
  last_name: string
  position: string
  height: string
  weight: string
  jersey_number: string
  college: string
  team: { abbreviation: string }
}

async function fetchBalldontlie(): Promise<Map<string, BdlPlayer>> {
  const apiKey = process.env.BALLDONTLIE_API_KEY
  if (!apiKey) return new Map()
  const out = new Map<string, BdlPlayer>()
  let cursor: number | null = null

  do {
    const url = new URL('https://api.balldontlie.io/wnba/v1/players/active')
    url.searchParams.set('per_page', '100')
    if (cursor) url.searchParams.set('cursor', String(cursor))
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(url.toString(), {
        headers: { Authorization: apiKey },
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) break
      const json = (await res.json()) as { data?: BdlPlayer[]; meta?: { next_cursor?: number | null } }
      for (const p of json.data ?? []) {
        const name = `${p.first_name} ${p.last_name}`.trim()
        out.set(normalizeName(name), p)
      }
      cursor = json.meta?.next_cursor ?? null
    } catch {
      break
    }
  } while (cursor)

  return out
}

export interface ScrapedWnbaPlayer {
  name: string
  slug: string
  team: string
  position: string
  salary: number
  status: string | null
  height: string | null
  stats: {
    gamesPlayed: number
    pointsPerGame: number
    reboundsPerGame: number
    assistsPerGame: number
    stealsPerGame: number
    blocksPerGame: number
    fgPercent: number
    threePercent: number
    ftPercent: number
  } | null
  sources: string[]
  confidence: number
}

export interface ScrapeResult {
  players: ScrapedWnbaPlayer[]
  totalCount: number
  sourceStatus: {
    herhoopstats: 'ok' | 'failed'
    herhoopstatsTeams: 'ok' | 'failed'
    balldontlie: 'ok' | 'failed'
    hhsError: string | null
    hhsTeamsError: string | null
    bdlError: string | null
  }
  scrapedAt: string
}

// Run all three sources in parallel and merge by normalized name.
// Promise.allSettled so a single-source failure doesn't kill the run.
export async function scrapeWnbaPlayers(year: number): Promise<ScrapeResult> {
  const [hhsResult, teamsResult, bdlResult] = await Promise.allSettled([
    scrapeHhsJson(year),
    scrapeHhsTeams(year),
    fetchBalldontlie(),
  ])

  const hhs = hhsResult.status === 'fulfilled' ? hhsResult.value : new Map<string, HHSJsonRow>()
  const teams = teamsResult.status === 'fulfilled' ? teamsResult.value : new Map<string, HHSTeamRow>()
  const bdl = bdlResult.status === 'fulfilled' ? bdlResult.value : new Map<string, BdlPlayer>()

  const merged: ScrapedWnbaPlayer[] = []
  const allKeys = new Set([...hhs.keys(), ...teams.keys(), ...bdl.keys()])

  for (const key of allKeys) {
    const h = hhs.get(key)
    const t = teams.get(key)
    const b = bdl.get(key)
    const sources: string[] = []
    if (h) sources.push('herhoopstats')
    if (t) sources.push('herhoopstats-team')
    if (b) sources.push('balldontlie')

    const name = t?._name ?? h?._name ?? (b ? `${b.first_name} ${b.last_name}` : key)
    const confidence =
      sources.length === 3 ? 1.0 : sources.some((s) => s.startsWith('herhoopstats')) ? 0.75 : 0.5

    merged.push({
      name,
      slug: slugify(name),
      team: normalizeTeam(t?.team_abbrev ?? h?.team_abbrev ?? b?.team?.abbreviation ?? ''),
      position: b?.position ?? '',
      salary: t?.salary || h?.salary || 0,
      status: t?.status ?? null,
      height: b?.height ?? null,
      stats: h
        ? {
            gamesPlayed: h.gp,
            pointsPerGame: h.pts_per_game,
            reboundsPerGame: h.trb_per_game,
            assistsPerGame: h.ast_per_game,
            stealsPerGame: h.stl_per_game,
            blocksPerGame: h.blk_s_per_game,
            fgPercent: h.fg_pct,
            threePercent: h.fg3m_pct,
            ftPercent: h.ft_pct,
          }
        : null,
      sources,
      confidence,
    })
  }

  merged.sort((a, b) => b.salary - a.salary)

  return {
    players: merged,
    totalCount: merged.length,
    sourceStatus: {
      herhoopstats: hhsResult.status === 'fulfilled' ? 'ok' : 'failed',
      herhoopstatsTeams: teamsResult.status === 'fulfilled' ? 'ok' : 'failed',
      balldontlie: bdlResult.status === 'fulfilled' ? 'ok' : 'failed',
      hhsError: hhsResult.status === 'rejected' ? String((hhsResult.reason as Error).message) : null,
      hhsTeamsError:
        teamsResult.status === 'rejected' ? String((teamsResult.reason as Error).message) : null,
      bdlError: bdlResult.status === 'rejected' ? String((bdlResult.reason as Error).message) : null,
    },
    scrapedAt: new Date().toISOString(),
  }
}
