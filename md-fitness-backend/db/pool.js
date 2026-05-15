import pg from 'pg'
import logger from '../config/logger.js'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,                // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('connect', () => logger.debug('New DB connection opened'))
pool.on('error', (err) => logger.error('DB pool error', { error: err.message }))

// Helper: run a query with automatic logging
export async function query(text, params) {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    logger.debug('Query executed', { duration: `${duration}ms`, rows: res.rowCount })
    return res
  } catch (err) {
    logger.error('Query failed', { error: err.message, query: text })
    throw err
  }
}

// Helper: get a client for transactions
export async function getClient() {
  const client = await pool.connect()
  const originalQuery = client.query.bind(client)
  const release = client.release.bind(client)

  // Timeout idle clients
  const timeout = setTimeout(() => {
    logger.error('Client checked out for too long — possible connection leak')
    client.release()
  }, 10000)

  client.release = () => {
    clearTimeout(timeout)
    return release()
  }

  return client
}

export async function testConnection() {
  try {
    const res = await query('SELECT NOW()')
    logger.info('Database connected', { time: res.rows[0].now })
    return true
  } catch (err) {
    logger.error('Database connection failed', { error: err.message })
    return false
  }
}

export default pool
