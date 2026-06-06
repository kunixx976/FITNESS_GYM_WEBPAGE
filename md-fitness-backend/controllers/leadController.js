import { query } from '../db/pool.js'
import { invalidateStats, invalidateLeads } from '../services/cacheService.js'
import { queueWhatsAppMessage, TEMPLATES, notifyOwnerNewLead } from '../services/whatsappService.js'
import { appendLeadToSheet } from '../services/googleSheetsService.js'
import logger from '../config/logger.js'

// ── POST /api/leads — public form submission ──────────────
export async function createLead(req, res, next) {
  try {
    const { name, phone, email, goal, location, available_time } = req.validatedData
    const ip = req.ip

    // Check for duplicate phone in last 24 hours (prevent spam)
    const existing = await query(
      `SELECT id FROM leads WHERE phone = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [phone]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'We already received your enquiry. Our team will contact you soon!',
      })
    }

    // Insert lead
    const result = await query(
      `INSERT INTO leads (name, phone, email, goal, location, available_time, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, phone, created_at, available_time`,
      [name, phone, email, goal || null, location || null, available_time || null, ip]
    )
    const lead = result.rows[0]

    // Invalidate caches
    await Promise.all([invalidateStats(), invalidateLeads()])

    // Queue welcome WhatsApp (fire-and-forget)
    queueWhatsAppMessage(lead.id, phone, TEMPLATES.welcome(name)).catch(err =>
      logger.warn('WhatsApp queue error after lead creation', { error: err.message })
    )

    // Notify owner of the new lead via WhatsApp (fire-and-forget)
    notifyOwnerNewLead({
      id: lead.id,
      name,
      phone,
      email,
      goal,
      available_time,
    }).catch(err =>
      logger.warn('Owner notification error after lead creation', { error: err.message })
    )

    // Append lead to Google Sheet (fire-and-forget)
    try {
      const leadForSheet = { name, phone, email, goal, available_time }
      appendLeadToSheet(leadForSheet).catch(err =>
        logger.warn('Google Sheets append error after lead creation', { error: err.message })
      )
    } catch (err) {
      logger.warn('Google Sheets setup error', { error: err.message })
    }

    logger.info('New lead created', { id: lead.id, name, phone, location })

    res.status(201).json({
      success: true,
      message: "Thanks! We'll contact you within 2 hours.",
      leadId: lead.id,
    })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/admin/leads — paginated leads list ───────────
export async function getLeads(req, res, next) {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1)
    const limit    = Math.min(100, parseInt(req.query.limit) || 20)
    const offset   = (page - 1) * limit
    const status   = req.query.status
    const search   = req.query.search?.trim()
    const from     = req.query.from   // date: YYYY-MM-DD
    const to       = req.query.to

    let conditions = []
    let params = []
    let i = 1

    if (status && status !== 'all') {
      conditions.push(`status = $${i++}`)
      params.push(status)
    }
    if (search) {
      conditions.push(`(name ILIKE $${i} OR phone ILIKE $${i} OR email ILIKE $${i})`)
      params.push(`%${search}%`)
      i++
    }
    if (from) { conditions.push(`created_at >= $${i++}`); params.push(from) }
    if (to)   { conditions.push(`created_at < $${i++}::date + 1`); params.push(to) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT id, name, phone, email, goal, location, status, notes, created_at, updated_at
         FROM leads ${where}
         ORDER BY created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) FROM leads ${where}`, params),
    ])

    const total = parseInt(countResult.rows[0].count)

    res.json({
      leads: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (err) {
    next(err)
  }
}

// ── PATCH /api/admin/leads/:id — update status/notes ─────
export async function updateLead(req, res, next) {
  try {
    const { id } = req.params
    const { status, notes } = req.validatedData

    const result = await query(
      `UPDATE leads SET
         status = COALESCE($1, status),
         notes  = COALESCE($2, notes)
       WHERE id = $3
       RETURNING *`,
      [status || null, notes ?? null, id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' })
    }

    await Promise.all([invalidateStats(), invalidateLeads()])

    logger.info('Lead updated', { id, status, by: req.admin.email })
    res.json({ success: true, lead: result.rows[0] })
  } catch (err) {
    next(err)
  }
}

// ── DELETE /api/admin/leads/:id ───────────────────────────
export async function deleteLead(req, res, next) {
  try {
    const { id } = req.params
    const result = await query('DELETE FROM leads WHERE id = $1 RETURNING id', [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' })
    }

    await Promise.all([invalidateStats(), invalidateLeads()])
    logger.info('Lead deleted', { id, by: req.admin.email })
    res.json({ success: true, message: `Lead #${id} deleted` })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/admin/stats ──────────────────────────────────
export async function getStats(req, res, next) {
  try {
    const { getCachedStats } = await import('../services/cacheService.js')

    const stats = await getCachedStats(async () => {
      const [totals, weekly, daily] = await Promise.all([
        query(`
          SELECT
            COUNT(*) FILTER (WHERE TRUE)                          AS total,
            COUNT(*) FILTER (WHERE status = 'New')                AS new,
            COUNT(*) FILTER (WHERE status = 'Called')             AS called,
            COUNT(*) FILTER (WHERE status = 'Joined')             AS joined,
            COUNT(*) FILTER (WHERE status = 'Not Interested')     AS not_interested
          FROM leads
        `),
        query(`SELECT COUNT(*) AS count FROM leads WHERE created_at > NOW() - INTERVAL '7 days'`),
        query(`SELECT COUNT(*) AS count FROM leads WHERE created_at > NOW() - INTERVAL '24 hours'`),
      ])

      return {
        totalLeads:     parseInt(totals.rows[0].total),
        leadsThisWeek:  parseInt(weekly.rows[0].count),
        leadsToday:     parseInt(daily.rows[0].count),
        statusBreakdown: {
          New:            parseInt(totals.rows[0].new),
          Called:         parseInt(totals.rows[0].called),
          Joined:         parseInt(totals.rows[0].joined),
          'Not Interested': parseInt(totals.rows[0].not_interested),
        },
        conversionRate: totals.rows[0].total > 0
          ? ((totals.rows[0].joined / totals.rows[0].total) * 100).toFixed(1) + '%'
          : '0%',
        generatedAt: new Date().toISOString(),
      }
    })

    res.json(stats)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/admin/export-csv ─────────────────────────────
export async function exportCSV(req, res, next) {
  try {
    const { status, from, to } = req.query
    let conditions = [], params = [], i = 1

    if (status && status !== 'all') { conditions.push(`status = $${i++}`); params.push(status) }
    if (from) { conditions.push(`created_at >= $${i++}`); params.push(from) }
    if (to)   { conditions.push(`created_at < $${i++}::date + 1`); params.push(to) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await query(
      `SELECT id, name, phone, email, goal, location, status, notes,
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS created_at
       FROM leads ${where}
       ORDER BY created_at DESC`,
      params
    )

    const headers = ['ID', 'Name', 'Phone', 'Email', 'Goal', 'Location', 'Status', 'Notes', 'Created At']
    const rows = result.rows.map(r =>
      [r.id, r.name, r.phone, r.email, r.goal || '', r.location || '', r.status, (r.notes || '').replace(/,/g, ';'), r.created_at]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )

    const csv = [headers.join(','), ...rows].join('\n')
    const filename = `md-fitness-leads-${new Date().toISOString().slice(0, 10)}.csv`

    logger.info('CSV exported', { rows: result.rows.length, by: req.admin.email })

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err) {
    next(err)
  }
}
