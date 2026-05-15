import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { loginLimiter, whatsappLimiter } from '../middleware/rateLimiter.js'
import { validate, loginSchema, updateLeadSchema, whatsappSchema } from '../middleware/validator.js'
import { login, getMe, sendWhatsApp } from '../controllers/adminController.js'
import {
  getLeads,
  updateLead,
  deleteLead,
  getStats,
  exportCSV,
} from '../controllers/leadController.js'

const router = Router()

// ── Public ────────────────────────────────────────────────
router.post('/login', loginLimiter, validate(loginSchema), login)

// ── Protected (all routes below require valid JWT) ────────
router.use(requireAuth)

router.get('/me',           getMe)
router.get('/stats',        getStats)
router.get('/leads',        getLeads)
router.patch('/leads/:id',  validate(updateLeadSchema), updateLead)
router.delete('/leads/:id', deleteLead)
router.get('/export-csv',   exportCSV)

router.post(
  '/send-whatsapp/:leadId',
  whatsappLimiter,
  validate(whatsappSchema),
  sendWhatsApp
)

export default router
