import { getRedis } from '../config/redis.js'
import logger from '../config/logger.js'

const KEYS = {
  STATS: 'md:stats',
  LEADS_PAGE: (page, status) => `md:leads:${page}:${status}`,
}

const TTL = {
  STATS: 300,   // 5 minutes
  LEADS: 60,    // 1 minute
}

// ── Stats cache ───────────────────────────────────────────
export async function getCachedStats(fetchFn) {
  const redis = getRedis()
  try {
    const cached = await redis.get(KEYS.STATS)
    if (cached) {
      logger.debug('Cache HIT: stats')
      return JSON.parse(cached)
    }
    logger.debug('Cache MISS: stats — fetching from DB')
    const fresh = await fetchFn()
    await redis.setEx(KEYS.STATS, TTL.STATS, JSON.stringify(fresh))
    return fresh
  } catch (err) {
    logger.warn('Cache error — falling back to DB', { error: err.message })
    return fetchFn()
  }
}

export async function invalidateStats() {
  try {
    const redis = getRedis()
    await redis.del(KEYS.STATS)
    logger.debug('Cache invalidated: stats')
  } catch (err) {
    logger.warn('Cache invalidation error', { error: err.message })
  }
}

// ── Leads cache ───────────────────────────────────────────
export async function getCachedLeads(page, status, fetchFn) {
  const redis = getRedis()
  const key = KEYS.LEADS_PAGE(page, status || 'all')
  try {
    const cached = await redis.get(key)
    if (cached) {
      logger.debug('Cache HIT: leads', { page, status })
      return JSON.parse(cached)
    }
    const fresh = await fetchFn()
    await redis.setEx(key, TTL.LEADS, JSON.stringify(fresh))
    return fresh
  } catch (err) {
    logger.warn('Leads cache error', { error: err.message })
    return fetchFn()
  }
}

export async function invalidateLeads() {
  try {
    const redis = getRedis()
    // Scan and delete all lead cache keys
    const keys = await redis.keys('md:leads:*')
    if (keys.length > 0) await redis.del(...keys)
    logger.debug('Cache invalidated: all leads pages')
  } catch (err) {
    logger.warn('Leads cache invalidation error', { error: err.message })
  }
}
