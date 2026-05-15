import logger from '../config/logger.js'

// 404 handler — must be registered after all routes
export function notFound(req, res) {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  })
}

// Global error handler — must have 4 params for Express to recognise it
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Log full error internally
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
  })

  // PostgreSQL errors
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry — this record already exists' })
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found' })
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' })
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' })
  }

  // Default — never expose stack traces in production
  const status = err.status || err.statusCode || 500
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An internal error occurred'
      : err.message,
  })
}
