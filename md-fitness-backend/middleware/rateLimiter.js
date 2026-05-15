import rateLimit from 'express-rate-limit'
import logger from '../config/logger.js'

// Generic handler for when limit is hit
function onLimitReached(req, res) {
  logger.warn('Rate limit hit', { ip: req.ip, path: req.path })
}

// ── Public lead form — very strict (5 per 15 min per IP)
export const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many submissions. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    onLimitReached(req, res)
    res.status(429).json(options.message)
  },
})

// ── Admin login — prevent brute force (10 attempts per 15 min)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Login brute force attempt', { ip: req.ip, email: req.body?.email })
    res.status(429).json(options.message)
  },
})

// ── General API — relaxed (100 per minute)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// ── WhatsApp send — 20 per hour (cost control)
export const whatsappLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'WhatsApp send limit reached for this hour.' },
})
