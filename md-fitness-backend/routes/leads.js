import { Router } from 'express'
import { leadLimiter } from '../middleware/rateLimiter.js'
import { validate, leadSchema } from '../middleware/validator.js'
import { createLead } from '../controllers/leadController.js'

const router = Router()

// POST /api/leads — public form submission
router.post('/', leadLimiter, validate(leadSchema), createLead)

export default router
