import { z } from 'zod'

// ── Reusable schemas ──────────────────────────────────────

export const leadSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z\s.'-]+$/, 'Name contains invalid characters'),

  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),

  email: z
    .string()
    .email('Enter a valid email address')
    .max(255),

  goal: z
    .enum(['Weight Loss', 'Muscle Gain', 'General Fitness', 'Athletic Performance', 'Rehabilitation'])
    .optional(),

  location: z
    .string()
    .min(2)
    .max(100)
    .optional(),
})

export const updateLeadSchema = z.object({
  status: z.enum(['New', 'Called', 'Joined', 'Not Interested']).optional(),
  notes: z.string().max(2000).optional(),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
})

export const whatsappSchema = z.object({
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message too long (max 1000 chars)'),
})

// ── Middleware factory ────────────────────────────────────
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }))
      return res.status(400).json({ error: 'Validation failed', errors })
    }
    req.validatedData = result.data
    next()
  }
}
