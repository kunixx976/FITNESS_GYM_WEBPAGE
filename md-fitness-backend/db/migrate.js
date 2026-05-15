import 'dotenv/config'
import { query } from './pool.js'
import logger from '../config/logger.js'

const migrations = [
  // ── Leads table ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS leads (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    phone        VARCHAR(15)  NOT NULL,
    email        VARCHAR(255) NOT NULL,
    goal         VARCHAR(50),
    location     VARCHAR(100),
    status       VARCHAR(30)  NOT NULL DEFAULT 'New'
                   CHECK (status IN ('New','Called','Joined','Not Interested')),
    notes        TEXT,
    ip_address   VARCHAR(45),
    source       VARCHAR(50)  DEFAULT 'website',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  // ── Indexes for fast lookups ──────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_leads_phone      ON leads(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_email      ON leads(email)`,

  // ── Admins table ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS admins (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(100),
    role          VARCHAR(20) DEFAULT 'admin',
    last_login    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── WhatsApp message log ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id         SERIAL PRIMARY KEY,
    lead_id    INT REFERENCES leads(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    status     VARCHAR(20) DEFAULT 'queued'
                 CHECK (status IN ('queued','sent','failed')),
    error      TEXT,
    sent_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── Auto-update updated_at trigger ───────────────────────
  `CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
   $$ LANGUAGE plpgsql`,

  `DROP TRIGGER IF EXISTS leads_updated_at ON leads`,

  `CREATE TRIGGER leads_updated_at
   BEFORE UPDATE ON leads
   FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
]

async function migrate() {
  logger.info('Running migrations...')
  for (const sql of migrations) {
    try {
      await query(sql)
      logger.info('✓ Migration OK', { preview: sql.slice(0, 60).replace(/\s+/g, ' ') })
    } catch (err) {
      logger.error('✗ Migration failed', { error: err.message, sql: sql.slice(0, 100) })
      process.exit(1)
    }
  }
  logger.info('All migrations complete ✅')
  process.exit(0)
}

migrate()
