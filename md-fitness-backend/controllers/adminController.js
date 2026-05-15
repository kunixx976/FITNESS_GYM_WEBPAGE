import bcrypt from 'bcryptjs'
import { query } from '../db/pool.js'
import { generateToken } from '../middleware/auth.js'
import { queueWhatsAppMessage } from '../services/whatsappService.js'
import logger from '../config/logger.js'

// ── POST /api/admin/login ─────────────────────────────────
export async function login(req, res, next) {
  try {
    const { email, password } = req.validatedData

    const result = await query('SELECT * FROM admins WHERE email = $1', [email])

    if (result.rows.length === 0) {
      logger.warn('Login attempt with unknown email', { email, ip: req.ip })
      // Timing-safe: still run bcrypt even on unknown email
      await bcrypt.compare(password, '$2b$12$invalidhashforsecuritypurposes000')
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const admin = result.rows[0]
    const passwordOk = await bcrypt.compare(password, admin.password_hash)

    if (!passwordOk) {
      logger.warn('Login failed — wrong password', { email, ip: req.ip })
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Update last login
    await query('UPDATE admins SET last_login = NOW() WHERE id = $1', [admin.id])

    const token = generateToken(admin)
    logger.info('Admin logged in', { email, ip: req.ip })

    res.json({
      success: true,
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/admin/me ─────────────────────────────────────
export async function getMe(req, res, next) {
  try {
    const result = await query(
      'SELECT id, email, name, role, last_login FROM admins WHERE id = $1',
      [req.admin.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Admin not found' })
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── POST /api/admin/send-whatsapp/:leadId ─────────────────
export async function sendWhatsApp(req, res, next) {
  try {
    const { leadId } = req.params
    const { message } = req.validatedData

    // Get lead's phone number
    const result = await query('SELECT id, name, phone FROM leads WHERE id = $1', [leadId])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' })
    }

    const lead = result.rows[0]
    const queued = await queueWhatsAppMessage(lead.id, lead.phone, message)

    logger.info('WhatsApp queued by admin', {
      leadId,
      phone: lead.phone,
      by: req.admin.email,
    })

    res.json({ success: true, ...queued })
  } catch (err) {
    next(err)
  }
}
