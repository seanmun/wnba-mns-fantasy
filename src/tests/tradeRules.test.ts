import { describe, it, expect } from 'vitest'
import { computeTradeCapImpact, isTradeDeadlinePassed } from '../rules/tradeRules'
import { WNBA_LEAGUE_PRESET } from '../lib/presets/wnba'
import type { Player } from '../types/player'
import type { RosterEntry } from '../types/roster'

function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: 'p',
    externalIds: {},
    name: 'P',
    position: 'G',
    salary: 100_000,
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

describe('computeTradeCapImpact', () => {
  it('produces before/after summaries for each involved team', () => {
    const players = new Map<string, Player>([
      ['p1', makePlayer({ id: 'p1', salary: 200_000 })],
      ['p2', makePlayer({ id: 'p2', salary: 300_000 })],
    ])
    const rosters = new Map<string, RosterEntry[]>([
      ['t1', [{ playerId: 'p1', decision: 'KEEP', baseRound: 5 }]],
      ['t2', [{ playerId: 'p2', decision: 'KEEP', baseRound: 5 }]],
    ])
    const results = computeTradeCapImpact({
      assets: [
        { type: 'keeper', id: 'p1', salary: 200_000, fromTeamId: 't1', toTeamId: 't2' },
        { type: 'keeper', id: 'p2', salary: 300_000, fromTeamId: 't2', toTeamId: 't1' },
      ],
      rosters,
      players,
      tradeDelta: new Map(),
      teamNames: new Map([['t1', 'Team One'], ['t2', 'Team Two']]),
      config: WNBA_LEAGUE_PRESET,
    })

    expect(results).toHaveLength(2)
    const t1 = results.find((r) => r.teamId === 't1')!
    expect(t1.salaryOut).toBe(200_000)
    expect(t1.salaryIn).toBe(300_000)
    expect(t1.after.capUsed).toBe(300_000)
  })

  it('warns on hard cap breach', () => {
    const players = new Map<string, Player>([
      ['p1', makePlayer({ id: 'p1', salary: 100_000 })],
      ['p2', makePlayer({ id: 'p2', salary: 2_000_000 })],
    ])
    const rosters = new Map<string, RosterEntry[]>([
      ['t1', [{ playerId: 'p1', decision: 'KEEP', baseRound: 5 }]],
      ['t2', [{ playerId: 'p2', decision: 'KEEP', baseRound: 5 }]],
    ])
    const results = computeTradeCapImpact({
      assets: [
        { type: 'keeper', id: 'p1', salary: 100_000, fromTeamId: 't1', toTeamId: 't2' },
        { type: 'keeper', id: 'p2', salary: 2_000_000, fromTeamId: 't2', toTeamId: 't1' },
      ],
      rosters,
      players,
      tradeDelta: new Map(),
      teamNames: new Map(),
      config: WNBA_LEAGUE_PRESET,
    })
    const t1 = results.find((r) => r.teamId === 't1')!
    expect(t1.warnings.some((w) => w.includes('hard cap'))).toBe(true)
  })
})

describe('isTradeDeadlinePassed', () => {
  it('false when no deadline set', () => {
    expect(isTradeDeadlinePassed(WNBA_LEAGUE_PRESET)).toBe(false)
  })

  it('false when today is before deadline', () => {
    const config = {
      ...WNBA_LEAGUE_PRESET,
      schedule: { ...WNBA_LEAGUE_PRESET.schedule, tradeDeadlineDate: '2026-08-01' },
    }
    expect(isTradeDeadlinePassed(config, new Date('2026-07-01'))).toBe(false)
  })

  it('true when today is after deadline', () => {
    const config = {
      ...WNBA_LEAGUE_PRESET,
      schedule: { ...WNBA_LEAGUE_PRESET.schedule, tradeDeadlineDate: '2026-08-01' },
    }
    expect(isTradeDeadlinePassed(config, new Date('2026-09-01'))).toBe(true)
  })
})
