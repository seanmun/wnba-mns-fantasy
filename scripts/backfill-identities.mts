import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// One-time (and re-runnable) migration: give every player row a
// league-independent identity, and teach those identities what each
// source calls the person.
//
// Pass 1 links existing league rows by their pool key (the Her Hoop
// Stats slug) — the same human in two leagues collapses to one identity
// because the second league's row matches that slug exactly.
// Pass 2 sweeps ESPN's rosters so each identity also carries its ESPN
// athlete id and birth date, which is what makes every later join an
// exact lookup instead of a name guess.
//
// Idempotent: rows already linked are skipped, and a known source key
// resolves to the identity it made last time.
//
//   npx tsx scripts/backfill-identities.mts [--dry]   (--dry reads only)

const dry = process.argv.includes('--dry')

const { db } = await import('../api/_db.js')
const { mnsPlayers, mnsPlayerIdentities } = await import('../src/lib/db/schema.js')
const { resolveIdentity } = await import('../src/lib/players/identity.js')
const { isRealPerson } = await import('../src/lib/players/names.js')
const { eq, sql } = await import('drizzle-orm')

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba'

// ── Pass 1: league rows → identities ────────────────────────────────
const rows = await db
  .select({
    id: mnsPlayers.id,
    leagueId: mnsPlayers.leagueId,
    name: mnsPlayers.name,
    sport: mnsPlayers.sport,
    externalIds: mnsPlayers.externalIds,
    identityId: mnsPlayers.identityId,
  })
  .from(mnsPlayers)

console.log(`player rows: ${rows.length}`)

const counts: Record<string, number> = {}
let linked = 0
let skipped = 0
for (const r of rows as Array<{
  id: string
  name: string
  sport: string | null
  externalIds: Record<string, string> | null
  identityId: string | null
}>) {
  if (!isRealPerson(r.name)) {
    skipped++
    continue
  }
  if (r.identityId) continue // already linked; re-runs are cheap
  // --dry means READ ONLY: resolveIdentity writes, so it must not run.
  if (dry) {
    linked++
    continue
  }
  const sport = r.sport ?? 'wnba'
  const hhs = r.externalIds?.hhs ?? null
  const res = await resolveIdentity(db, sport, {
    source: 'hhs',
    sourceId: hhs,
    name: r.name,
  })
  if (!res) {
    skipped++
    continue
  }
  counts[res.outcome] = (counts[res.outcome] ?? 0) + 1
  if (!dry) {
    await db.update(mnsPlayers).set({ identityId: res.identityId }).where(eq(mnsPlayers.id, r.id))
  }
  linked++
}
console.log(`pass 1 — linked ${linked}, skipped ${skipped} (not people)`)
console.log('   outcomes:', counts)

// ── Pass 2: ESPN ids and birth dates onto those identities ──────────
const teams = (await (await fetch(`${ESPN}/teams`)).json()) as {
  sports?: Array<{ leagues?: Array<{ teams?: Array<{ team: { id: string } }> }> }>
}
const teamIds = (teams.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team.id)
let espnSeen = 0
const espnCounts: Record<string, number> = {}
for (const teamId of teamIds) {
  const roster = (await (await fetch(`${ESPN}/teams/${teamId}/roster`)).json()) as {
    athletes?: Array<{ id?: string; displayName?: string; fullName?: string; dateOfBirth?: string }>
  }
  for (const a of roster.athletes ?? []) {
    const name = a.displayName ?? a.fullName
    if (!name || !a.id) continue
    espnSeen++
    if (dry) continue // writes too
    const res = await resolveIdentity(db, 'wnba', {
      source: 'espn',
      sourceId: a.id,
      name,
      birthDate: a.dateOfBirth,
    })
    if (res) espnCounts[res.outcome] = (espnCounts[res.outcome] ?? 0) + 1
  }
}
console.log(`\npass 2 — ${espnSeen} ESPN athletes`)
console.log('   outcomes:', espnCounts)

// ── What the crosswalk looks like now ───────────────────────────────
const [tot] = await db
  .select({
    identities: sql<number>`count(*)`,
    withEspn: sql<number>`count(*) filter (where ${mnsPlayerIdentities.externalIds} ? 'espn')`,
    withHhs: sql<number>`count(*) filter (where ${mnsPlayerIdentities.externalIds} ? 'hhs')`,
    withBoth: sql<number>`count(*) filter (where ${mnsPlayerIdentities.externalIds} ? 'espn' and ${mnsPlayerIdentities.externalIds} ? 'hhs')`,
    withBirth: sql<number>`count(*) filter (where ${mnsPlayerIdentities.birthDate} is not null)`,
    review: sql<number>`count(*) filter (where ${mnsPlayerIdentities.needsReview})`,
  })
  .from(mnsPlayerIdentities)
console.log('\nidentities:', tot)

const unlinked = await db
  .select({ n: sql<number>`count(*)` })
  .from(mnsPlayers)
  .where(sql`${mnsPlayers.identityId} is null`)
console.log('player rows still unlinked:', unlinked[0]?.n)

if (Number(tot?.review ?? 0) > 0) {
  const flagged = await db
    .select({ name: mnsPlayerIdentities.fullName, note: mnsPlayerIdentities.reviewNote })
    .from(mnsPlayerIdentities)
    .where(eq(mnsPlayerIdentities.needsReview, true))
    .limit(20)
  console.log('\nneeds a human:', flagged)
}

// A name held by more than one identity is either two real people or a
// duplicate to collapse — either way, worth seeing.
const dupes = await db
  .select({
    name: mnsPlayerIdentities.normalizedName,
    n: sql<number>`count(*)`,
  })
  .from(mnsPlayerIdentities)
  .groupBy(mnsPlayerIdentities.normalizedName)
  .having(sql`count(*) > 1`)
console.log('\nshared names across identities:', dupes.length ? dupes : 'none')
