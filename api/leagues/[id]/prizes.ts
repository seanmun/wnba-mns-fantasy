import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { verifyAuth } from '../../_middleware.js'
import { db } from '../../_db.js'
import { mnsLeagues, mnsPortfolios, mnsTeams } from '../../../src/lib/db/schema.js'
import { computeStandings } from '../../../src/lib/season/score.js'
import { logger } from '../../_logger.js'
import type { LeagueConfig } from '../../../src/types/leagueConfig.js'

// The prize pool, TRACKED never handled: cash the manager holds plus
// the live value of an optional PUBLIC wallet (Alchemy balance ×
// CoinGecko price, the legacy mns recipe). Valuations cache in
// wnba.portfolios for ten minutes so browsing doesn't hammer the RPC.
//
// GET /api/leagues/:id/prizes
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const leagueId = String(req.query.id ?? '')
  try {
    const [league] = await db.select().from(mnsLeagues).where(eq(mnsLeagues.id, leagueId)).limit(1)
    if (!league) return res.status(404).json({ error: 'League not found' })
    const config = league.config as LeagueConfig
    const prizes = config.prizes ?? { potUsd: 0, walletAddress: null, splits: [] }

    // Wallet valuation, cache-first.
    let wallet: {
      address: string
      ethBalance: number | null
      ethPrice: number | null
      usdValue: number | null
      lastUpdated: string | null
      error: string | null
      baselineUsd?: number | null
      baselineAt?: string | null
      gainPct?: number | null
    } | null = null
    if (prizes.walletAddress && /^0x[a-fA-F0-9]{40}$/.test(prizes.walletAddress)) {
      const address = prizes.walletAddress
      const [cached] = await db
        .select()
        .from(mnsPortfolios)
        .where(eq(mnsPortfolios.id, leagueId))
        .limit(1)
      const fresh =
        cached &&
        cached.walletAddress === address &&
        Date.now() - new Date(cached.lastUpdated).getTime() < 10 * 60 * 1000
      if (fresh) {
        wallet = {
          address,
          ethBalance: cached.cachedEthBalance != null ? Number(cached.cachedEthBalance) : null,
          ethPrice: cached.cachedEthPrice != null ? Number(cached.cachedEthPrice) : null,
          usdValue: cached.cachedUsdValue != null ? Number(cached.cachedUsdValue) : null,
          lastUpdated: cached.lastUpdated.toISOString(),
          error: null,
        }
      } else {
        wallet = await valueWallet(address)
        if (wallet.usdValue != null) {
          // The BASELINE (usdInvested) locks at the first successful
          // valuation — day 1 of tracking — and is never overwritten;
          // gain/loss reads against it from then on. A new address
          // starts a new baseline.
          await db
            .insert(mnsPortfolios)
            .values({
              id: leagueId,
              leagueId,
              walletAddress: address,
              usdInvested: String(wallet.usdValue),
              cachedEthBalance: String(wallet.ethBalance),
              cachedEthPrice: String(wallet.ethPrice),
              cachedUsdValue: String(wallet.usdValue),
              lastUpdated: new Date(),
            })
            .onConflictDoUpdate({
              target: mnsPortfolios.id,
              set: {
                walletAddress: address,
                ...(cached && cached.walletAddress !== address
                  ? { usdInvested: String(wallet.usdValue), createdAt: new Date() }
                  : {}),
                cachedEthBalance: String(wallet.ethBalance),
                cachedEthPrice: String(wallet.ethPrice),
                cachedUsdValue: String(wallet.usdValue),
                lastUpdated: new Date(),
                updatedAt: new Date(),
              },
            })
        } else if (cached && cached.walletAddress === address) {
          // Live lookup failed — serve the stale cache honestly.
          wallet = {
            address,
            ethBalance: cached.cachedEthBalance != null ? Number(cached.cachedEthBalance) : null,
            ethPrice: cached.cachedEthPrice != null ? Number(cached.cachedEthPrice) : null,
            usdValue: cached.cachedUsdValue != null ? Number(cached.cachedUsdValue) : null,
            lastUpdated: cached.lastUpdated.toISOString(),
            error: wallet.error,
          }
        }
      }
    }

    // Attach the locked baseline and the move since.
    if (wallet) {
      const [row] = await db
        .select()
        .from(mnsPortfolios)
        .where(eq(mnsPortfolios.id, leagueId))
        .limit(1)
      const baseline = row ? Number(row.usdInvested) : 0
      if (row && baseline > 0) {
        wallet.baselineUsd = baseline
        wallet.baselineAt = row.createdAt.toISOString()
        wallet.gainPct =
          wallet.usdValue != null
            ? Math.round(((wallet.usdValue - baseline) / baseline) * 1000) / 10
            : null
      }
    }

    const totalUsd = (prizes.potUsd || 0) + (wallet?.usdValue ?? 0)

    // Who currently holds each paid place, straight from standings.
    const teams = await db.select().from(mnsTeams).where(eq(mnsTeams.leagueId, leagueId))
    const rec = await computeStandings(db, leagueId)
    const ranked = teams
      .map((t) => ({ name: t.name, ...(rec.get(t.id) ?? { wins: 0, losses: 0, ties: 0, pointsFor: 0 }) }))
      .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)

    return res.status(200).json({
      potUsd: prizes.potUsd || 0,
      wallet,
      totalUsd,
      splits: prizes.splits.map((sp, i) => ({
        ...sp,
        amountUsd: Math.round(totalUsd * sp.share) / 100,
        holder: ranked[i]?.name ?? null,
      })),
      configured: !!config.prizes,
      isCommissioner: league.commissionerId === userId,
    })
  } catch (err) {
    logger.error('GET /api/leagues/[id]/prizes failed', {
      leagueId,
      err: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Failed to load the prize pool' })
  }
}

async function valueWallet(address: string) {
  const out = {
    address,
    ethBalance: null as number | null,
    ethPrice: null as number | null,
    usdValue: null as number | null,
    lastUpdated: null as string | null,
    error: null as string | null,
  }
  // Server-side name first; the VITE_ spelling is accepted so a key
  // entered under the browser prefix still works, but the key never
  // belongs in client code.
  const key = process.env.ALCHEMY_API_KEY ?? process.env.VITE_ALCHEMY_API_KEY
  if (!key) {
    out.error = 'ALCHEMY_API_KEY is not set on this project yet.'
    return out
  }
  try {
    const bal = (await (
      await fetch(`https://eth-mainnet.g.alchemy.com/v2/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBalance',
          params: [address, 'latest'],
        }),
      })
    ).json()) as { result?: string; error?: { message: string } }
    if (bal.error || !bal.result) throw new Error(bal.error?.message ?? 'no balance result')
    out.ethBalance = parseInt(bal.result, 16) / 1e18

    const price = (await (
      await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
    ).json()) as { ethereum?: { usd?: number } }
    if (!price.ethereum?.usd) throw new Error('no ETH price')
    out.ethPrice = price.ethereum.usd
    out.usdValue = out.ethBalance * out.ethPrice
    out.lastUpdated = new Date().toISOString()
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'wallet lookup failed'
  }
  return out
}
