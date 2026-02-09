export const createInMemoryRateLimiter = ({ windowMs = 60_000, max = 100 } = {}) => {
  const buckets = new Map()
  let lastPruneAt = 0

  const pruneStale = (now) => {
    if (now - lastPruneAt < windowMs) return
    lastPruneAt = now

    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key)
      }
    }
  }

  return (request, response, next) => {
    const now = Date.now()
    pruneStale(now)

    const key = request.ip || request.socket?.remoteAddress || 'unknown'
    const existing = buckets.get(key)

    if (!existing || existing.resetAt <= now) {
      const nextBucket = { count: 1, resetAt: now + windowMs }
      buckets.set(key, nextBucket)
      response.setHeader('X-RateLimit-Limit', String(max))
      response.setHeader('X-RateLimit-Remaining', String(max - nextBucket.count))
      response.setHeader('X-RateLimit-Reset', String(Math.ceil(nextBucket.resetAt / 1000)))
      next()
      return
    }

    existing.count += 1
    response.setHeader('X-RateLimit-Limit', String(max))
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - existing.count)))
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)))

    if (existing.count > max) {
      response.status(429).json({
        error: 'Too many requests. Please retry shortly.'
      })
      return
    }

    next()
  }
}

