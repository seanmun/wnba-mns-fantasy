import { describe, expect, it } from 'vitest'
import {
  COUNTS_AGAINST_CAP,
  HOLDS_ROSTER_SPOT,
  capUsed,
  redshirtEligible,
  rosterSpots,
} from '../lib/season/roster'

const p = (id: string, slot: string, salary: number) => ({ id, teamId: 'T', slot, salary })

describe('slot semantics', () => {
  it('IR and redshirt free a roster spot; active and bench hold one', () => {
    expect(HOLDS_ROSTER_SPOT('active')).toBe(true)
    expect(HOLDS_ROSTER_SPOT('bench')).toBe(true)
    expect(HOLDS_ROSTER_SPOT('ir')).toBe(false)
    expect(HOLDS_ROSTER_SPOT('redshirt')).toBe(false)
  })

  it('only redshirt escapes the cap — IR still costs money', () => {
    expect(COUNTS_AGAINST_CAP('ir')).toBe(true)
    expect(COUNTS_AGAINST_CAP('redshirt')).toBe(false)
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
  const rookie = { isRookie: true, redshirtUsed: false, slot: 'bench' }

  it('lets a rookie who has never played be redshirted', () => {
    expect(redshirtEligible(rookie, 0).ok).toBe(true)
  })

  it('refuses a veteran, even one who has not played', () => {
    const v = redshirtEligible({ ...rookie, isRookie: false }, 0)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/rookies/i)
  })

  it('refuses a rookie who has already debuted', () => {
    const v = redshirtEligible(rookie, 1)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/already played/i)
  })

  it('refuses a second redshirt once the first was spent', () => {
    const v = redshirtEligible({ ...rookie, redshirtUsed: true }, 0)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/already used/i)
  })

  it('refuses someone already on redshirt', () => {
    expect(redshirtEligible({ ...rookie, slot: 'redshirt' }, 0).ok).toBe(false)
  })
})
