// Positional roster slots. A league either plays all-flex (Beta Babes:
// ten of anybody) or names its shape — 2 C, 4 F, 4 G — and every active
// player has to fit somewhere.
//
// Players are never PINNED to a slot. A lineup is legal when every
// active player CAN be given a distinct slot she qualifies for, which
// lets a dual-eligible player float to wherever she's needed. That is
// a bipartite matching, solved exactly below — the greedy answer is
// wrong often enough to matter (two centers and a C/F, one C slot and
// one F slot: greedy can park the C/F in C and strand a true center).

export interface PositionSlot {
  code: string
  count: number
}

// What each slot code accepts. WNBA feeds G/F/C; NBA feeds the five,
// and the broad codes still work as groupings over them.
const ACCEPTS: Record<string, string[]> = {
  C: ['C'],
  F: ['F', 'SF', 'PF'],
  G: ['G', 'PG', 'SG'],
  PG: ['PG'],
  SG: ['SG'],
  SF: ['SF'],
  PF: ['PF'],
  GF: ['G', 'PG', 'SG', 'F', 'SF', 'PF'],
  FC: ['F', 'SF', 'PF', 'C'],
}

export const isFlex = (code: string): boolean =>
  code === 'FLEX' || code === 'UTIL' || code === 'ANY'

// "G", "G-F", "PG/SG" — a player carries every position she's listed at.
export function positionsOf(position: string | null | undefined): string[] {
  if (!position) return []
  return position
    .toUpperCase()
    .split(/[-/,]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function eligibleForSlot(position: string | null | undefined, slotCode: string): boolean {
  if (isFlex(slotCode)) return true
  const mine = positionsOf(position)
  if (mine.length === 0) return false
  const accepts = ACCEPTS[slotCode.toUpperCase()] ?? [slotCode.toUpperCase()]
  return mine.some((p) => accepts.includes(p))
}

// The league's shape as a flat list of openings: [C, C, F, F, F, F, ...].
export function expandSlots(slots: PositionSlot[]): string[] {
  return slots.flatMap((s) => Array.from({ length: Math.max(0, s.count) }, () => s.code))
}

export interface AssignmentResult {
  ok: boolean
  /** playerId → the slot code she fills. */
  assignment: Map<string, string>
  /** Players with no legal slot left. */
  unplaced: string[]
  /** Slot codes still open after the assignment. */
  openSlots: string[]
}

interface Placeable {
  id: string
  position: string | null | undefined
}

// Kuhn's algorithm: try to give every player a distinct opening, and
// when one is taken, ask its holder to move. Exact, and trivial at
// roster sizes.
export function assignSlots(players: Placeable[], slots: PositionSlot[]): AssignmentResult {
  const openings = expandSlots(slots)
  // No shape declared means all-flex: everyone fits, nothing to check.
  if (openings.length === 0) {
    return {
      ok: true,
      assignment: new Map(players.map((p) => [p.id, 'FLEX'])),
      unplaced: [],
      openSlots: [],
    }
  }

  // openingOwner[i] = index into players, or -1 when the opening is free.
  const openingOwner: number[] = new Array(openings.length).fill(-1)
  const playerOpening = new Map<string, number>()

  const tryPlace = (pi: number, seen: boolean[]): boolean => {
    for (let oi = 0; oi < openings.length; oi++) {
      if (seen[oi]) continue
      if (!eligibleForSlot(players[pi].position, openings[oi])) continue
      seen[oi] = true
      // Free, or its current holder can shuffle elsewhere.
      if (openingOwner[oi] === -1 || tryPlace(openingOwner[oi], seen)) {
        openingOwner[oi] = pi
        playerOpening.set(players[pi].id, oi)
        return true
      }
    }
    return false
  }

  const unplaced: string[] = []
  for (let pi = 0; pi < players.length; pi++) {
    if (!tryPlace(pi, new Array(openings.length).fill(false))) {
      unplaced.push(players[pi].id)
    }
  }

  const assignment = new Map<string, string>()
  for (const [playerId, oi] of playerOpening) assignment.set(playerId, openings[oi])
  const openSlots = openings.filter((_, oi) => openingOwner[oi] === -1)

  return { ok: unplaced.length === 0, assignment, unplaced, openSlots }
}

// Plain English for a refusal: what she is, and what the lineup has
// room for.
export function noSlotReason(position: string | null | undefined, openSlots: string[]): string {
  const what = positionsOf(position).join('/') || 'that position'
  if (openSlots.length === 0) {
    return `Your active lineup is full — bench someone before starting another ${what}.`
  }
  const names = [...new Set(openSlots)].join(', ')
  return `No open ${what} slot. Your lineup still has room at: ${names}.`
}
