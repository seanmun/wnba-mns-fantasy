// One-shot script that mirrors the populate-pool endpoint, but runs
// directly with full logging so we can verify the scraper + upsert
// works end-to-end without going through Clerk auth.
//
// Usage:  npx tsx scripts/test-populate-pool.ts [leagueId]

import { config as loadEnv } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, sql as dsql } from 'drizzle-orm'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '..', '.env.local') })
loadEnv({ path: join(__dirname, '..', '.env') })

import { scrapeWnbaPlayers } from '../src/lib/scrapers/wnba'
import { mnsLeagues, mnsPlayers, mnsLeagueImports } from '../src/lib/db/schema'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = neon(dbUrl)
const db = drizzle(sql, {
  schema: { mnsLeagues, mnsPlayers, mnsLeagueImports },
})

function generatePlayerId(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `wnba-${slug}-${suffix}`
}

async function main() {
  let leagueId = process.argv[2]

  if (!leagueId) {
    // Find first WNBA league for current commissioner.
    const rows = await db
      .select({ id: mnsLeagues.id, name: mnsLeagues.name, seasonYear: mnsLeagues.seasonYear })
      .from(mnsLeagues)
      .where(eq(mnsLeagues.sport, 'wnba'))
      .limit(5)
    if (rows.length === 0) {
      console.error('No WNBA leagues found.')
      process.exit(1)
    }
    console.log('Available WNBA leagues:')
    rows.forEach((r) => console.log(`  ${r.id}  (${r.name}, ${r.seasonYear})`))
    leagueId = rows[0].id
    console.log(`\nUsing: ${leagueId}\n`)
  }

  const [league] = await db
    .select({ seasonYear: mnsLeagues.seasonYear, sport: mnsLeagues.sport })
    .from(mnsLeagues)
    .where(eq(mnsLeagues.id, leagueId))
    .limit(1)
  if (!league) {
    console.error(`League ${leagueId} not found.`)
    process.exit(1)
  }
  if (league.sport !== 'wnba') {
    console.error(`League ${leagueId} is not WNBA.`)
    process.exit(1)
  }

  console.log(`Scraping WNBA player pool for season ${league.seasonYear}…`)
  const t0 = Date.now()
  const result = await scrapeWnbaPlayers(league.seasonYear)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`Done in ${elapsed}s. ${result.totalCount} players merged.`)
  console.log('Source status:', result.sourceStatus)

  if (result.totalCount === 0) {
    console.error('No players scraped. Aborting upsert.')
    process.exit(1)
  }

  console.log('\nTop 10 by salary:')
  result.players.slice(0, 10).forEach((p) => {
    console.log(`  $${p.salary.toLocaleString().padStart(10)} ${p.name.padEnd(28)} ${p.team} ${p.position || '—'}`)
  })

  console.log('\nUpserting to wnba.players…')
  let inserted = 0
  let updated = 0
  for (const p of result.players) {
    if (!p.slug) continue
    const existing = await db
      .select({ id: mnsPlayers.id })
      .from(mnsPlayers)
      .where(
        and(
          eq(mnsPlayers.leagueId, leagueId),
          dsql`${mnsPlayers.externalIds}->>'hhs' = ${p.slug}`
        )
      )
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(mnsPlayers)
        .set({
          name: p.name,
          position: p.position || 'F',
          salary: p.salary,
          teamCode: p.team,
          externalIds: { hhs: p.slug },
          updatedAt: new Date(),
        })
        .where(eq(mnsPlayers.id, existing[0].id))
      updated++
    } else {
      await db.insert(mnsPlayers).values({
        id: generatePlayerId(p.slug),
        externalIds: { hhs: p.slug },
        name: p.name,
        position: p.position || 'F',
        salary: p.salary,
        teamCode: p.team,
        leagueId,
        teamId: null,
        sport: 'wnba',
        slot: 'active',
      })
      inserted++
    }
  }
  console.log(`Upsert done. Inserted: ${inserted}, Updated: ${updated}`)

  console.log('\nDone.')
}

void main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
