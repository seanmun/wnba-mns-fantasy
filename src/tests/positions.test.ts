import { describe, expect, it } from 'vitest'
import {
  assignSlots,
  eligibleForSlot,
  expandSlots,
  positionsOf,
} from '../lib/season/positions'

const p = (id: string, position: string) => ({ id, position })
const SHAPE = [
  { code: 'C', count: 2 },
  { code: 'F', count: 4 },
  { code: 'G', count: 4 },
]

describe('position parsing and eligibility', () => {
  it('reads dual eligibility from any separator', () => {
    expect(positionsOf('G-F')).toEqual(['G', 'F'])
    expect(positionsOf('PG/SG')).toEqual(['PG', 'SG'])
    expect(positionsOf(null)).toEqual([])
  })

  it('treats broad codes as groups over the NBA five', () => {
    expect(eligibleForSlot('PG', 'G')).toBe(true)
    expect(eligibleForSlot('PF', 'F')).toBe(true)
    expect(eligibleForSlot('PG', 'F')).toBe(false)
    expect(eligibleForSlot('C', 'C')).toBe(true)
  })

  it('lets flex take anyone, including an unknown position', () => {
    expect(eligibleForSlot('C', 'FLEX')).toBe(true)
    expect(eligibleForSlot(null, 'FLEX')).toBe(true)
    expect(eligibleForSlot(null, 'G')).toBe(false)
  })

  it('expands a shape into openings', () => {
    expect(expandSlots([{ code: 'C', count: 2 }])).toEqual(['C', 'C'])
  })
})

describe('assignSlots', () => {
  it('treats an empty shape as all-flex: everyone fits', () => {
    const r = assignSlots([p('a', 'C'), p('b', 'G')], [])
    expect(r.ok).toBe(true)
    expect(r.unplaced).toEqual([])
  })

  it('fills a legal lineup and reports what is still open', () => {
    const r = assignSlots([p('a', 'C'), p('b', 'G'), p('c', 'F')], SHAPE)
    expect(r.ok).toBe(true)
    expect(r.assignment.get('a')).toBe('C')
    expect(r.openSlots.sort()).toEqual(['C', 'F', 'F', 'F', 'G', 'G', 'G'])
  })

  it('refuses one more center than the shape allows', () => {
    const r = assignSlots([p('a', 'C'), p('b', 'C'), p('c', 'C')], SHAPE)
    expect(r.ok).toBe(false)
    expect(r.unplaced).toEqual(['c'])
  })

  it('shuffles a dual-eligible player so a specialist can fit', () => {
    // The C/F takes the only C slot first; the true center then forces
    // her to move to F. Greedy assignment gets this wrong.
    const r = assignSlots([p('swing', 'C-F'), p('pure', 'C')], [
      { code: 'C', count: 1 },
      { code: 'F', count: 1 },
    ])
    expect(r.ok).toBe(true)
    expect(r.assignment.get('pure')).toBe('C')
    expect(r.assignment.get('swing')).toBe('F')
  })

  it('lets flex soak up an overflow the named slots cannot take', () => {
    const shape = [{ code: 'C', count: 1 }, { code: 'FLEX', count: 1 }]
    const r = assignSlots([p('a', 'C'), p('b', 'C')], shape)
    expect(r.ok).toBe(true)
  })

  it('allows a short lineup — missing players is not illegal', () => {
    const r = assignSlots([p('a', 'G')], SHAPE)
    expect(r.ok).toBe(true)
    expect(r.openSlots).toHaveLength(9)
  })
})
