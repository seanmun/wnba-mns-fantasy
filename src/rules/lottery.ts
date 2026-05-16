// Mulberry32 — deterministic PRNG. Same seed → same sequence.
// Lets us run the rookie lottery once for real and reproduce the
// result later for audit, without storing the full ordering.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export interface LotteryEntry {
  teamId: string
  odds: number
}

// Run a weighted-random rookie draft order. `entries` should be sorted
// by record (worst first). Returns team IDs in pick order.
export function runLottery(params: {
  entries: LotteryEntry[]
  seed: number
}): string[] {
  const { entries, seed } = params
  const rng = mulberry32(seed)
  const remaining = entries.map((e) => ({ ...e }))
  const order: string[] = []

  while (remaining.length > 0) {
    const totalOdds = remaining.reduce((s, r) => s + r.odds, 0)
    if (totalOdds <= 0) {
      // Fallback: take in current order if odds are all zero
      order.push(remaining.shift()!.teamId)
      continue
    }
    const r = rng() * totalOdds
    let acc = 0
    let pickedIdx = remaining.length - 1
    for (let i = 0; i < remaining.length; i++) {
      acc += remaining[i].odds
      if (r < acc) {
        pickedIdx = i
        break
      }
    }
    order.push(remaining[pickedIdx].teamId)
    remaining.splice(pickedIdx, 1)
  }

  return order
}

// Linear odds: worst team gets highest weight, best gets lowest.
// Simpler than NBA's stepped lottery but good for small leagues.
// Returns percentages summing to 100.
export function defaultLotteryOdds(teamCount: number): number[] {
  if (teamCount <= 0) return []
  const totalWeight = (teamCount * (teamCount + 1)) / 2
  const odds: number[] = []
  for (let i = 0; i < teamCount; i++) {
    odds.push(((teamCount - i) / totalWeight) * 100)
  }
  return odds
}
