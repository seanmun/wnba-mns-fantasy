import { describe, it, expect } from 'vitest'
import { validateRoster } from '../rules/validationRules'
import { WNBA_LEAGUE_PRESET } from '../lib/presets/wnba'
import type { Player } from '../types/player'
import type { RosterEntry } from '../types/roster'

function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    externalIds: {},
    name: 'Test',
    position: 'G',
    salary: 0,
    teamCode: '',
    leagueId: '',
    teamId: null,
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

describe('validateRoster', () => {
  it('errors when keeper count exceeds maxKeepers', () => {
    const entries: RosterEntry[] = Array.from({ length: 6 }, (_, i) => ({
      playerId: `p${i}`,
      decision: 'KEEP' as const,
      baseRound: i + 1,
      keeperRound: i + 1,
    }))
    const players = new Map(entries.map((e) => [e.playerId, makePlayer({ id: e.playerId })]))
    const errors = validateRoster(entries, players, WNBA_LEAGUE_PRESET)
    expect(errors.some((e) => e.field === 'keepersCount')).toBe(true)
  })

  it('errors on INT_STASH for ineligible player', () => {
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'INT_STASH', baseRound: 10 },
    ]
    const players = new Map([['p1', makePlayer({ intEligible: false })]])
    const errors = validateRoster(entries, players, WNBA_LEAGUE_PRESET)
    expect(errors.some((e) => e.field === 'intStashEligibility')).toBe(true)
  })

  it('errors on missing baseRound for KEEP', () => {
    const entries: RosterEntry[] = [{ playerId: 'p1', decision: 'KEEP' }]
    const players = new Map([['p1', makePlayer()]])
    const errors = validateRoster(entries, players, WNBA_LEAGUE_PRESET)
    expect(errors.some((e) => e.field === 'missingBaseRound')).toBe(true)
  })

  it('errors on round collision', () => {
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'KEEP', baseRound: 5, keeperRound: 5 },
      { playerId: 'p2', decision: 'KEEP', baseRound: 5, keeperRound: 5 },
    ]
    const players = new Map([
      ['p1', makePlayer({ id: 'p1' })],
      ['p2', makePlayer({ id: 'p2' })],
    ])
    const errors = validateRoster(entries, players, WNBA_LEAGUE_PRESET)
    expect(errors.some((e) => e.field === 'roundCollisions')).toBe(true)
  })

  it('errors when INT_STASH is configured off', () => {
    const config = { ...WNBA_LEAGUE_PRESET, roster: { ...WNBA_LEAGUE_PRESET.roster, intStashAllowed: false } }
    const entries: RosterEntry[] = [{ playerId: 'p1', decision: 'INT_STASH', baseRound: 10 }]
    const players = new Map([['p1', makePlayer({ intEligible: true })]])
    const errors = validateRoster(entries, players, config)
    expect(errors.some((e) => e.field === 'intStashDisabled')).toBe(true)
  })

  it('returns no errors for a clean roster', () => {
    const entries: RosterEntry[] = [
      { playerId: 'p1', decision: 'KEEP', baseRound: 5, keeperRound: 5 },
      { playerId: 'p2', decision: 'DROP', baseRound: 5 },
    ]
    const players = new Map([
      ['p1', makePlayer({ id: 'p1' })],
      ['p2', makePlayer({ id: 'p2' })],
    ])
    const errors = validateRoster(entries, players, WNBA_LEAGUE_PRESET)
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0)
  })

  it('warns when KEEP has baseRound but no keeperRound', () => {
    const entries: RosterEntry[] = [{ playerId: 'p1', decision: 'KEEP', baseRound: 5 }]
    const players = new Map([['p1', makePlayer()]])
    const errors = validateRoster(entries, players, WNBA_LEAGUE_PRESET)
    expect(errors.some((e) => e.field === 'unassignedRound' && e.type === 'warning')).toBe(true)
  })
})
