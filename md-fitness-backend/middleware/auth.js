import jwt from 'jsonwebtoken'
import logger from '../config/logger.js'

export function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    req.admin = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired — please log in again' })
    }
    logger.warn('Invalid token attempt', { ip: req.ip })
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export function generateToken(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  )
}
