import { and, eq, sql } from 'drizzle-orm'
import { mnsPlayerIdentities } from '../db/schema.js'
import { birthDateOf, canonicalName, isRealPerson, normalizeName } from './names.js'

// Resolving a printed name to a PERSON, once, and writing the answer
// down. Every source key we learn goes into external_ids, so the next
// run is an exact lookup instead of another match attempt.
//
// The order is deliberate, strongest evidence first, and a name alone
// never merges two people when a birth date says otherwise. Anything
// uncertain is created and FLAGGED rather than guessed — a wrong merge
// is far more expensive than an extra row a human collapses later.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface SourceRecord {
  /** Which feed this came from: 'espn', 'hhs', 'fantrax'… */
  source: string
  /** That feed's own id for the player, when it has one. */
  sourceId?: string | null
  name: string
  /** ISO date or ESPN's timestamp form — both accepted. */
  birthDate?: string | null
}

export type ResolveOutcome =
  | 'external_id'
  | 'name_and_birthdate'
  | 'name_only'
  | 'nickname_and_birthdate'
  | 'created'

export interface Resolution {
  identityId: string
  outcome: ResolveOutcome
  needsReview: boolean
}

const newId = (sport: string) =>
  `${sport}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export async function resolveIdentity(
  db: Db,
  sport: string,
  rec: SourceRecord
): Promise<Resolution | null> {
  if (!isRealPerson(rec.name)) return null

  const norm = normalizeName(rec.name)
  const canon = canonicalName(rec.name)
  const birth = birthDateOf(rec.birthDate)
  const key = rec.source

  // 1. This source's own id — the only certain match, and the reason
  //    everything else exists: to earn one of these.
  if (rec.sourceId) {
    const [hit] = await db
      .select()
      .from(mnsPlayerIdentities)
      .where(
        and(
          eq(mnsPlayerIdentities.sport, sport),
          sql`${mnsPlayerIdentities.externalIds}->>${key} = ${String(rec.sourceId)}`
        )
      )
      .limit(1)
    if (hit) {
      // Learn the birth date if this feed carries one and we lacked it.
      if (birth && !hit.birthDate) {
        await db
          .update(mnsPlayerIdentities)
          .set({ birthDate: birth, updatedAt: new Date() })
          .where(eq(mnsPlayerIdentities.id, hit.id))
      }
      return { identityId: hit.id, outcome: 'external_id', needsReview: hit.needsReview }
    }
  }

  const byName = await db
    .select()
    .from(mnsPlayerIdentities)
    .where(
      and(eq(mnsPlayerIdentities.sport, sport), eq(mnsPlayerIdentities.normalizedName, norm))
    )

  // 2. One name match, and the birth dates agree: certain.
  const birthAgrees = birth ? byName.filter((r: { birthDate: string | null }) => r.birthDate === birth) : []
  if (birthAgrees.length === 1) {
    return await link(db, birthAgrees[0], key, rec.sourceId, birth, 'name_and_birthdate')
  }

  // A birth date that CONTRADICTS every same-name row means a different
  // person with the same name — do not touch them.
  const contradicts =
    birth && byName.length > 0 && byName.every((r: { birthDate: string | null }) => r.birthDate && r.birthDate !== birth)

  // 3. Exactly one name match and nothing contradicts it.
  if (byName.length === 1 && !contradicts) {
    return await link(db, byName[0], key, rec.sourceId, birth, 'name_only')
  }

  // 4. Nickname form, but ONLY with a birth date to confirm it —
  //    "Alex" is Alexander or Alexandra, so the name cannot stand alone.
  if (birth && canon !== norm) {
    const byCanon = await db
      .select()
      .from(mnsPlayerIdentities)
      .where(
        and(
          eq(mnsPlayerIdentities.sport, sport),
          eq(mnsPlayerIdentities.canonicalName, canon),
          eq(mnsPlayerIdentities.birthDate, birth)
        )
      )
      .limit(2)
    if (byCanon.length === 1) {
      return await link(db, byCanon[0], key, rec.sourceId, birth, 'nickname_and_birthdate')
    }
  }

  // 5. Nothing certain: make a new person, and say why it is unsure so a
  //    human can collapse duplicates instead of the app inventing a
  //    merge.
  const ambiguous = byName.length > 1 || !!contradicts
  const id = newId(sport)
  await db.insert(mnsPlayerIdentities).values({
    id,
    sport,
    fullName: rec.name.trim(),
    normalizedName: norm,
    canonicalName: canon,
    birthDate: birth,
    externalIds: rec.sourceId ? { [key]: String(rec.sourceId) } : {},
    needsReview: ambiguous,
    reviewNote: ambiguous
      ? byName.length > 1
        ? `${byName.length} existing identities share this name — confirm which is right.`
        : 'Same name as an existing identity but a different birth date — confirm these are two people.'
      : null,
  })
  return { identityId: id, outcome: 'created', needsReview: ambiguous }
}

async function link(
  db: Db,
  row: { id: string; externalIds: Record<string, string>; birthDate: string | null; needsReview: boolean },
  key: string,
  sourceId: string | null | undefined,
  birth: string | null,
  outcome: ResolveOutcome
): Promise<Resolution> {
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  // Record the key so this match never has to be made again.
  if (sourceId && row.externalIds?.[key] !== String(sourceId)) {
    patch.externalIds = { ...(row.externalIds ?? {}), [key]: String(sourceId) }
  }
  if (birth && !row.birthDate) patch.birthDate = birth
  if (Object.keys(patch).length > 1) {
    await db.update(mnsPlayerIdentities).set(patch).where(eq(mnsPlayerIdentities.id, row.id))
  }
  return { identityId: row.id, outcome, needsReview: row.needsReview }
}

/** Identities a human still needs to look at. */
export async function identitiesNeedingReview(db: Db, sport: string) {
  return db
    .select()
    .from(mnsPlayerIdentities)
    .where(and(eq(mnsPlayerIdentities.sport, sport), eq(mnsPlayerIdentities.needsReview, true)))
    .orderBy(mnsPlayerIdentities.normalizedName)
}
