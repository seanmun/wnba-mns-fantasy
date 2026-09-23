import { describe, expect, it } from 'vitest'
import {
  COUNTS_AGAINST_CAP,
  HOLDS_ROSTER_SPOT,
  capUsed,
  intStashEligible,
  redshirtEligible,
  rosterSpots,
} from '../lib/season/roster'

const p = (id: string, slot: string, salary: number) => ({ id, teamId: 'T', slot, salary })

describe('slot semantics', () => {
  it('IR, redshirt and stash free a roster spot; active and bench hold one', () => {
    expect(HOLDS_ROSTER_SPOT('active')).toBe(true)
    expect(HOLDS_ROSTER_SPOT('bench')).toBe(true)
    expect(HOLDS_ROSTER_SPOT('ir')).toBe(false)
    expect(HOLDS_ROSTER_SPOT('redshirt')).toBe(false)
    expect(HOLDS_ROSTER_SPOT('international')).toBe(false)
  })

  it('redshirt and stash escape the cap — IR still costs money', () => {
    expect(COUNTS_AGAINST_CAP('ir')).toBe(true)
    expect(COUNTS_AGAINST_CAP('redshirt')).toBe(false)
    expect(COUNTS_AGAINST_CAP('international')).toBe(false)
  })

  it('counts spots and cap independently', () => {
    const roster = [
      p('a', 'active', 1_000_000),
      p('b', 'bench', 500_000),
      p('c', 'ir', 400_000),
      p('d', 'redshirt', 900_000),
    ]
    expect(rosterSpots(roster, 'T').map((x) => x.id)).toEqual(['a', 'b'])
    // IR counts against the cap, the redshirt does not.
    expect(capUsed(roster, 'T')).toBe(1_900_000)
  })

  it('ignores other teams', () => {
    const roster = [p('a', 'active', 100), { ...p('b', 'active', 999), teamId: 'OTHER' }]
    expect(capUsed(roster, 'T')).toBe(100)
    expect(rosterSpots(roster, 'T')).toHaveLength(1)
  })
})

describe('redshirtEligible', () => {
  // Elizabeth Balogun, 2026: rookie, jersey 5 with New York, no minutes.
  const here = { yearsPro: 0, redshirtUsed: false, slot: 'bench', leaguePresence: 'rostered' }

  it('lets a rookie who is with a club and has not debuted be redshirted', () => {
    expect(redshirtEligible(here, 0).ok).toBe(true)
  })

  it('refuses a veteran, even one who has not played', () => {
    const v = redshirtEligible({ ...here, yearsPro: 9 }, 0)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/rookies/i)
  })

  it('refuses a rookie who has already debuted', () => {
    expect(redshirtEligible(here, 1).reason).toMatch(/already played/i)
  })

  it('refuses a second redshirt once the first was spent', () => {
    expect(redshirtEligible({ ...here, redshirtUsed: true }, 0).reason).toMatch(/already used/i)
  })

  it('refuses someone already on redshirt', () => {
    expect(redshirtEligible({ ...here, slot: 'redshirt' }, 0).ok).toBe(false)
  })

  // Elena Buenavida, 2026: drafted by Minnesota, no jersey, never
  // reported. Identical to Balogun on years and games — only presence
  // tells them apart.
  it('refuses a drafted player who never reported — that is a stash', () => {
    const v = redshirtEligible({ ...here, leaguePresence: 'rights_only' }, 0)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/stash/i)
  })

  it('refuses a rookie on no WNBA roster at all', () => {
    expect(redshirtEligible({ ...here, leaguePresence: 'absent' }, 0).ok).toBe(false)
  })

  it("honours the commissioner's correction over the ESPN heuristic", () => {
    const corrected = { ...here, leaguePresence: 'rights_only', presenceOverride: 'rostered' }
    expect(redshirtEligible(corrected, 0).ok).toBe(true)
  })

  it('falls back to the is_rookie flag while years_pro is unknown', () => {
    const noYears = { isRookie: true, slot: 'bench', leaguePresence: 'rostered' }
    expect(redshirtEligible(noYears, 0).ok).toBe(true)
    expect(redshirtEligible({ ...noYears, isRookie: false }, 0).ok).toBe(false)
  })
})

describe('intStashEligible', () => {
  it('stashes a veteran playing abroad — experience is irrelevant', () => {
    // Emma Meesseman: 12 years pro, on no WNBA roster.
    expect(intStashEligible({ yearsPro: 12, leaguePresence: 'absent' }, 0).ok).toBe(true)
  })

  it('stashes a draftee who never reported', () => {
    expect(intStashEligible({ yearsPro: 0, leaguePresence: 'rights_only' }, 0).ok).toBe(true)
  })

  it('refuses a player who is with a WNBA club', () => {
    const v = intStashEligible({ yearsPro: 0, leaguePresence: 'rostered' }, 0)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/WNBA roster/i)
  })

  it('refuses anyone who has played here this season', () => {
    expect(intStashEligible({ leaguePresence: 'absent' }, 3).reason).toMatch(/has played/i)
  })
})
