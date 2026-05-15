import Redis from 'ioredis'
import logger from './logger.js'

let redisClient = null

export function getRedis() {
  if (redisClient) return redisClient

  // If no Redis URL, use in-memory fallback (for local dev without Redis)
  if (!process.env.REDIS_URL) {
    logger.warn('No REDIS_URL — using in-memory cache (not suitable for production)')
    return createMemoryCache()
  }

  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000)
      logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`)
      return delay
    },
    reconnectOnError(err) {
      logger.error('Redis connection error', { error: err.message })
      return true
    },
  })

  redisClient.on('connect', () => logger.info('Redis connected'))
  redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }))

  return redisClient
}

// Simple in-memory fallback when Redis isn't available (dev only)
function createMemoryCache() {
  const store = new Map()
  return {
    async get(key) { 
      const item = store.get(key)
      if (!item) return null
      if (item.expiry && Date.now() > item.expiry) { store.delete(key); return null }
      return item.value
    },
    async setEx(key, seconds, value) {
      store.set(key, { value, expiry: Date.now() + seconds * 1000 })
    },
    async del(...keys) { keys.forEach(k => store.delete(k)) },
    async ping() { return 'PONG' },
  }
}
