import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'

import logger from './config/logger.js'
import { testConnection } from './db/pool.js'
import { getRedis } from './config/redis.js'
import { initWhatsAppQueue } from './services/whatsappService.js'
import { apiLimiter } from './middleware/rateLimiter.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

import leadsRouter from './routes/leads.js'
import adminRouter from './routes/admin.js'

const app = express()
const PORT = process.env.PORT || 5000

// ══════════════════════════════════════════════════════════
//  SECURITY MIDDLEWARE
// ══════════════════════════════════════════════════════════

// HTTP security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,   // allow embedding images
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}))

// CORS — only allow your frontend domains
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_2,
  'http://localhost:3000',
  'http://127.0.0.1:5500',   // Live Server for HTML dev
  'http://localhost:5001',
  'http://127.0.0.1:5001',
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      logger.warn('CORS blocked request', { origin })
      callback(new Error(`CORS: origin ${origin} not allowed`))
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// ══════════════════════════════════════════════════════════
//  REQUEST PARSING
// ══════════════════════════════════════════════════════════

app.use(express.json({ limit: '10kb' }))       // max 10KB body
app.use(express.urlencoded({ extended: false, limit: '10kb' }))

// Trust proxy (needed for correct IP behind Nginx / Railway / Render)
app.set('trust proxy', 1)

// Request logger
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} — ${ms}ms`, {
      ip: req.ip,
      ua: req.headers['user-agent']?.slice(0, 80),
    })
  })
  next()
})

// ══════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════

// Rate limit all API routes
app.use('/api', apiLimiter)

// Health check — used by Railway/Render/UptimeRobot
app.get('/health', async (req, res) => {
  try {
    const redis = getRedis()
    const [dbOk, redisOk] = await Promise.allSettled([
      testConnection(),
      redis.ping(),
    ])
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()) + 's',
      db: dbOk.status === 'fulfilled' ? 'connected' : 'error',
      redis: redisOk.status === 'fulfilled' ? 'connected' : 'unavailable',
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    })
  } catch {
    res.status(503).json({ status: 'error' })
  }
})

// API routes
app.use('/api/leads', leadsRouter)
app.use('/api/admin', adminRouter)

// 404 + global error handler — must be last
app.use(notFound)
app.use(errorHandler)

// ══════════════════════════════════════════════════════════
//  STARTUP
// ══════════════════════════════════════════════════════════

async function start() {
  logger.info('Starting MD Fitness Backend...', { env: process.env.NODE_ENV })

  // 1. Database
  const dbOk = await testConnection()
  if (!process.env.DATABASE_URL) {
    logger.warn('DATABASE_URL not set — starting in limited mode. Lead creation will use Supabase if configured.')
  } else if (!dbOk) {
    logger.warn('Cannot connect to database — starting in limited mode. Lead creation will use Supabase if configured.')
  }

  // 2. Redis + WhatsApp queue (non-fatal if unavailable)
  try {
    const redis = getRedis()
    await redis.ping()
    logger.info('Redis connected')
    initWhatsAppQueue()
  } catch {
    logger.warn('Redis unavailable — caching and job queue disabled')
  }

  // 3. Start server
  const server = app.listen(PORT, () => {
    logger.info(`✅ Server running on port ${PORT}`)
    logger.info(`   Health: http://localhost:${PORT}/health`)
    logger.info(`   API:    http://localhost:${PORT}/api`)
  })

  // ── Graceful shutdown ──────────────────────────────────
  function shutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully`)
    server.close(async () => {
      logger.info('HTTP server closed')
      const { default: pool } = await import('./db/pool.js')
      await pool.end()
      logger.info('Database pool closed')
      process.exit(0)
    })

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced exit after timeout')
      process.exit(1)
    }, 10000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))

  // Catch unhandled errors — log and exit so the platform restarts
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise rejection', { reason })
    shutdown('unhandledRejection')
  })
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack })
    shutdown('uncaughtException')
  })
}

start()
