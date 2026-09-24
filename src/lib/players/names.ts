// Turning a printed name into a match key. Deterministic on purpose:
// identity must give the same answer every run, so nothing here guesses.
// Measured against the live pool (2026-09-23), plain normalization
// matched 210 of 280 players exactly and the 70 misses were players
// absent from the feed, not misspellings — while fuzzy matching at the
// distance needed to catch anything would have merged Tina Charles
// into Kaila Charles. So: rules here, judgment in a review queue.

// Suffixes are decoration, and sources disagree about carrying them.
// "Jaren Jackson Jr." and "Jaren Jackson" are one person.
const SUFFIXES = new Set(['jr', 'jnr', 'sr', 'snr', 'ii', 'iii', 'iv', 'v'])

// Short forms sources use interchangeably. Written as short → canonical,
// applied to the FIRST name only: surnames are never nicknamed, and
// "Matt" as a surname must survive untouched.
//
// Some entries are genuinely ambiguous across people — Alex is
// Alexander or Alexandra, Sam is Samuel or Samantha, Tina is Tina or
// Christina. That is why a canonical-name hit is NEVER accepted on its
// own: the resolver requires a matching birth date before it will
// believe one. Without that rule this map could merge two people.
const NICKNAMES: Record<string, string> = {
  matt: 'matthew', matty: 'matthew', mike: 'michael', mikey: 'michael',
  nick: 'nicholas', nik: 'nicholas', chris: 'christopher', cris: 'christopher',
  dave: 'david', davey: 'david', rob: 'robert', bob: 'robert', bobby: 'robert',
  rick: 'richard', rich: 'richard', dick: 'richard', jim: 'james', jimmy: 'james',
  jamie: 'james', bill: 'william', billy: 'william', will: 'william',
  willie: 'william', tom: 'thomas', tommy: 'thomas', tony: 'anthony',
  ant: 'anthony', joe: 'joseph', joey: 'joseph', dan: 'daniel', danny: 'daniel',
  ben: 'benjamin', benny: 'benjamin', sam: 'samuel', sammy: 'samuel',
  alex: 'alexander', xander: 'alexander', ed: 'edward', eddie: 'edward',
  ted: 'edward', steve: 'steven', stevie: 'steven', stephen: 'steven',
  greg: 'gregory', jeff: 'jeffrey', geoff: 'jeffrey', ken: 'kenneth',
  kenny: 'kenneth', ron: 'ronald', ronnie: 'ronald', don: 'donald',
  donnie: 'donald', pat: 'patrick', paddy: 'patrick', cam: 'cameron',
  charlie: 'charles', chuck: 'charles', frank: 'francis', gabe: 'gabriel',
  isa: 'isaiah', ike: 'isaac', jake: 'jacob', josh: 'joshua', nate: 'nathaniel',
  nathan: 'nathaniel', phil: 'philip', tim: 'timothy', timmy: 'timothy',
  vince: 'vincent', zach: 'zachary', zack: 'zachary',
  // Women's side, for the WNBA pool.
  kate: 'katherine', katie: 'katherine', kathy: 'katherine',
  cathy: 'catherine', cat: 'catherine', liz: 'elizabeth', beth: 'elizabeth',
  betsy: 'elizabeth', becky: 'rebecca', becca: 'rebecca', jen: 'jennifer',
  jenny: 'jennifer', jess: 'jessica', jessie: 'jessica',
  mandy: 'amanda', abby: 'abigail', maddie: 'madison', maddy: 'madison',
  allie: 'allison', ally: 'allison', steph: 'stephanie', tori: 'victoria',
  vicky: 'victoria', chrissy: 'christina',
  nikki: 'nicole', angie: 'angela', deb: 'deborah', debbie: 'deborah',
  susie: 'susan', teri: 'theresa', terri: 'theresa', gabby: 'gabrielle',
}

// Letters, spaces, nothing else — accents folded, apostrophes and
// hyphens dropped so "A'ja" and "Nelson-Ododa" survive as one token run.
function strip(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

/** The plain match key: accent-folded, punctuation-free, suffix-free. */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  const parts = strip(name)
  // Only trailing suffixes count — a middle "V" is an initial.
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1])) parts.pop()
  return parts.join(' ')
}

/**
 * A second key with the first name expanded to its canonical form, so
 * "Matt Thomas" and "Matthew Thomas" collide on purpose. Equal to
 * normalizeName when no nickname applies, and only ever consulted after
 * an exact match fails.
 */
export function canonicalName(name: string | null | undefined): string {
  const parts = normalizeName(name).split(' ').filter(Boolean)
  if (parts.length === 0) return ''
  const canon = NICKNAMES[parts[0]]
  if (canon) parts[0] = canon
  return parts.join(' ')
}

// Rows that are not people. The legacy import left placeholder "players"
// for tradable draft picks ("2027 Round 3 Pick ? (?) (DAL)"), and those
// must never become identities.
export function isRealPerson(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim()
  if (n.length < 3) return false
  if (/\bround\b.*\bpick\b/i.test(n)) return false
  if (/^\d{4}\b/.test(n)) return false
  if (n.includes('?')) return false
  return /[a-z]/i.test(n)
}

/** ESPN gives "1987-08-21T07:00Z"; identity wants the calendar day. */
export function birthDateOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
  return m ? m[1] : null
}
