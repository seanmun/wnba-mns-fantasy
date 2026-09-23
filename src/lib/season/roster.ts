// What a roster slot MEANS, in one place. Three slots hold a player
// without holding a spot, and they differ in what else they cost:
//
//   active   — scores, holds a spot, counts against the cap
//   bench    — no scoring, holds a spot, counts against the cap
//   ir       — no scoring, NO spot, still counts against the cap
//   redshirt — no scoring, NO spot, NO cap hit, costs a fee each way
//
// Every count and every cap sum goes through these predicates. The
// rules lived scattered as `slot !== 'ir'` and raw salary sums, which
// is exactly how redshirt silently ate a roster spot and a cap hit.

export const HOLDS_ROSTER_SPOT = (slot: string | null | undefined): boolean =>
  slot !== 'ir' && slot !== 'redshirt'

export const COUNTS_AGAINST_CAP = (slot: string | null | undefined): boolean =>
  slot !== 'redshirt'

interface SlotPlayer {
  teamId?: string | null
  slot?: string | null
  salary?: number | null
}

// Players on a team occupying one of its roster spots.
export function rosterSpots<T extends SlotPlayer>(players: T[], teamId: string): T[] {
  return players.filter((p) => p.teamId === teamId && HOLDS_ROSTER_SPOT(p.slot))
}

// A team's salary against the cap — redshirts ride free.
export function capUsed(players: SlotPlayer[], teamId: string): number {
  return players
    .filter((p) => p.teamId === teamId && COUNTS_AGAINST_CAP(p.slot))
    .reduce((n, p) => n + (p.salary ?? 0), 0)
}

// Redshirt eligibility, Sean's rule (2026-09-23): only rookies, and
// only ones who have NEVER played — a debut spends the chance, as does
// coming off redshirt once. `gamesPlayed` is games on file for the
// player (0 when nothing has been logged).
export function redshirtEligible(
  player: { isRookie?: boolean; redshirtUsed?: boolean; slot?: string | null },
  gamesPlayed: number
): { ok: boolean; reason?: string } {
  if (player.slot === 'redshirt') return { ok: false, reason: 'Already on redshirt.' }
  if (player.redshirtUsed) {
    return { ok: false, reason: 'Redshirt already used — a player only gets one.' }
  }
  if (!player.isRookie) return { ok: false, reason: 'Only rookies can be redshirted.' }
  if (gamesPlayed > 0) {
    return { ok: false, reason: 'She has already played — redshirt is for rookies who have not debuted.' }
  }
  return { ok: true }
}
