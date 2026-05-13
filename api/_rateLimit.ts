interface Bucket {
  tokens: number
  lastRefill: number
}

interface RateLimitConfig {
  capacity: number
  refillPerSecond: number
}

const DEFAULT_CONFIG: RateLimitConfig = { capacity: 10, refillPerSecond: 1 }

const buckets = new Map<string, Bucket>()

// Token-bucket rate limiter. In-memory per cold start — acceptable for
// v1 traffic; swap to Upstash Redis when global consistency is needed.
export function rateLimit(key: string, cfg: RateLimitConfig = DEFAULT_CONFIG): boolean {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { tokens: cfg.capacity, lastRefill: now }
    buckets.set(key, bucket)
  }
  const elapsedSec = (now - bucket.lastRefill) / 1000
  bucket.tokens = Math.min(cfg.capacity, bucket.tokens + elapsedSec * cfg.refillPerSecond)
  bucket.lastRefill = now
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return true
  }
  return false
}
