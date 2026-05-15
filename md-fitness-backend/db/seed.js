import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { query } from './pool.js'
import logger from '../config/logger.js'

async function seed() {
  const email = process.env.ADMIN_EMAIL || 'admin@mdfitnessgym.in'
  const password = process.env.ADMIN_SEED_PASSWORD || 'changeme123'

  const hash = await bcrypt.hash(password, 12)

  await query(
    `INSERT INTO admins (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2`,
    [email, hash, 'MD Fitness Admin', 'admin']
  )

  logger.info(`Admin seeded: ${email} / ${password}`)
  logger.warn('IMPORTANT: Change password immediately after first login!')
  process.exit(0)
}

seed().catch(err => { logger.error(err); process.exit(1) })
