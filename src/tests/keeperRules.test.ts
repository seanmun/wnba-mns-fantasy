import { describe, it, expect } from 'vitest'
import { baseKeeperRound, stackKeeperRounds, computeSummary } from '../rules/keeperRules'
import { WNBA_LEAGUE_PRESET } from '../lib/presets/wnba'
import type { Player } from '../types/player'
import type { RosterEntry } from '../types/roster'

function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    externalIds: {},
    name: 'Test',
    position: 'G',
    salary: 500_000,
    teamCode: 'NYL',
    leagueId: 'mns-wnba-2026',
    teamId: 't1',
    sport: 'wnba',
    slot: 'active',
    onIR: false,
    isRookie: false,
    isInternationalStash: false,
    intEligible: false,
    rookieDraftInfo: null,
    keeperPriorYearRound: null,
    keeperDerivedBaseRound: null,
    migratedKeeperRound: null,
    migrationSource: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

describe('baseKeeperRound', () => {
  it('uses rookieRoundMap for rookies', () => {
    const p = makePlayer({
      isRookie: true,
      rookieDraftInfo: { round: 1, pick: 2, redshirtEligible: false },
    })
    expect(baseKeeperRound(p, WNBA_LEAGUE_PRESET)).toBe(4)
  })

  it('advances priorYearRound by minus_one', () => {
    const p = makePlayer({ keeperPriorYearRound: 5 })
    expect(baseKeeperRound(p, WNBA_LEAGUE_PRESET)).toBe(4)
  })

  it('floors priorYearRound at 1', () => {
    const p = makePlayer({ keeperPriorYearRound: 1 })
    expect(baseKeeperRound(p, WNBA_LEAGUE_PRESET)).toBe(1)
  })

  it('uses migratedKeeperRound directly', () => {
    const p = makePlayer({ migratedKeeperRound: 7 })
    expect(baseKeeperRound(p, WNBA_LEAGUE_PRESET)).toBe(7)
  })

  it('returns null when no source applies and fallback is null', () => {
    const p = makePlayer()
    expect(baseKeeperRound(p, WNBA_LEAGUE_PRESET)).toBeNull()
  })

  it('returns fallback when configured', () => {
    const p = makePlayer()
    const config = { ...WNBA_LEAGUE_PRESET, keeper: { ...WNBA_LEAGUE_PRESET.keeper, fallbackRound: 10 } }
    expect(baseKeeperRound(p, config)).toBe(10)
  })

  it('handles flat advance rule', () => {
    const config = { ...WNBA_LEAGUE_PRESET, keeper: { ...WNBA_LEAGUE_PRESET.keeper, advanceRule: 'flat' as const } }
    const p = makePlayer({ keeperPriorYearRound: 5 })
    expect(baseKeeperRound(p, config)).toBe(5)
  })
})

describe('stackKeeperRounds', () => {
  it('places a single R1 keeper at round 1 with no franchise tags', () => {
    const entries: RosterEntry[] = [{ playerId: 'p1', decision: 'KEEP', baseRound: 1 }]
    const result = stackKeeperRounds(entries, WNBA_LEAGUE_PRESET)
    expect(result.franchiseTags).toBe(0)
    expect(entries[0].keeperRound).toBe(1)
  })

  it('charges franchise tags for extra R1 keepers', () => {
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'KEEP', baseRound: 1, priority: 1 },
      { playerId: 'p2', decision: 'KEEP', baseRound: 1, priority: 2 },
      { playerId: 'p3', decision: 'KEEP', baseRound: 1, priority: 3 },
    ]
    const result = stackKeeperRounds(entries, WNBA_LEAGUE_PRESET)
    expect(result.franchiseTags).toBe(2)
    expect(entries[0].keeperRound).toBe(1)
    expect(entries[1].keeperRound).toBe(2)
    expect(entries[2].keeperRound).toBe(3)
  })

  it('stacks non-R1 keepers downward when no R1 keepers exist', () => {
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'KEEP', baseRound: 5 },
      { playerId: 'p2', decision: 'KEEP', baseRound: 5 },
    ]
    const result = stackKeeperRounds(entries, WNBA_LEAGUE_PRESET)
    expect(result.franchiseTags).toBe(0)
    // Two collisions at base 5 → one keeps 5, the other backs up
    const rounds = entries.map((e) => e.keeperRound)
    expect(rounds).toContain(5)
    expect(rounds).toContain(4)
  })

  it('caps at config.draft.rounds when forward search is needed', () => {
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'KEEP', baseRound: 10 },
      { playerId: 'p2', decision: 'KEEP', baseRound: 10 },
    ]
    const result = stackKeeperRounds(entries, WNBA_LEAGUE_PRESET)
    expect(result.franchiseTags).toBe(0)
    // 10-round draft per WNBA preset; second keeper backs up to 9
    const rounds = entries.map((e) => e.keeperRound)
    expect(rounds).toContain(10)
    expect(rounds).toContain(9)
  })

  it('clears keeperRound on non-KEEP entries', () => {
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'KEEP', baseRound: 5, keeperRound: 5 },
      { playerId: 'p2', decision: 'DROP', baseRound: 5, keeperRound: 5 },
      { playerId: 'p3', decision: 'REDSHIRT', baseRound: 5, keeperRound: 5 },
    ]
    stackKeeperRounds(entries, WNBA_LEAGUE_PRESET)
    expect(entries[1].keeperRound).toBeUndefined()
    expect(entries[2].keeperRound).toBeUndefined()
  })
})

describe('computeSummary', () => {
  it('sums KEEP salaries into capUsed', () => {
    const players = new Map<string, Player>([
      ['p1', makePlayer({ id: 'p1', salary: 500_000 })],
      ['p2', makePlayer({ id: 'p2', salary: 300_000 })],
    ])
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'KEEP' },
      { playerId: 'p2', decision: 'KEEP' },
    ]
    const summary = computeSummary({
      entries,
      allPlayers: players,
      config: WNBA_LEAGUE_PRESET,
      tradeDelta: 0,
      franchiseTags: 0,
    })
    expect(summary.capUsed).toBe(800_000)
    expect(summary.keepersCount).toBe(2)
  })

  it('counts redshirts and computes redshirtDues', () => {
    const players = new Map<string, Player>([
      ['p1', makePlayer({ id: 'p1', salary: 100_000 })],
      ['p2', makePlayer({ id: 'p2', salary: 100_000 })],
    ])
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'REDSHIRT' },
      { playerId: 'p2', decision: 'REDSHIRT' },
    ]
    const summary = computeSummary({
      entries,
      allPlayers: players,
      config: WNBA_LEAGUE_PRESET,
      tradeDelta: 0,
      franchiseTags: 0,
    })
    expect(summary.redshirtsCount).toBe(2)
    expect(summary.redshirtDues).toBe(20)
    expect(summary.capUsed).toBe(0)
  })

  it('charges franchiseTagDues', () => {
    const summary = computeSummary({
      entries: [],
      allPlayers: new Map(),
      config: WNBA_LEAGUE_PRESET,
      tradeDelta: 0,
      franchiseTags: 2,
    })
    expect(summary.franchiseTagDues).toBe(30)
  })

  it('zero apron fees when aprons are disabled (WNBA preset)', () => {
    const players = new Map<string, Player>([
      ['p1', makePlayer({ id: 'p1', salary: 2_000_000 })],
    ])
    const entries: RosterEntry[] = [{ playerId: 'p1', decision: 'KEEP' }]
    const summary = computeSummary({
      entries,
      allPlayers: players,
      config: WNBA_LEAGUE_PRESET,
      tradeDelta: 0,
      franchiseTags: 0,
    })
    expect(summary.firstApronFee).toBe(0)
    expect(summary.penaltyDues).toBe(0)
  })

  it('charges first apron fee when enabled and over', () => {
    const config = {
      ...WNBA_LEAGUE_PRESET,
      cap: { ...WNBA_LEAGUE_PRESET.cap, firstApron: 1_000_000 },
      fees: { ...WNBA_LEAGUE_PRESET.fees, firstApronFee: 50 },
    }
    const players = new Map<string, Player>([
      ['p1', makePlayer({ id: 'p1', salary: 1_500_000 })],
    ])
    const entries: RosterEntry[] = [{ playerId: 'p1', decision: 'KEEP' }]
    const summary = computeSummary({
      entries,
      allPlayers: players,
      config,
      tradeDelta: 0,
      franchiseTags: 0,
    })
    expect(summary.firstApronFee).toBe(50)
  })
})
