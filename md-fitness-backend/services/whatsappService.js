import { Queue, Worker } from 'bullmq'
import { getRedis } from '../config/redis.js'
import { query } from '../db/pool.js'
import logger from '../config/logger.js'

let whatsappQueue = null
let whatsappWorker = null

// ── Initialize queue + worker ─────────────────────────────
export function initWhatsAppQueue() {
  const connection = getRedis()
  if (!process.env.REDIS_URL) {
    logger.warn('WhatsApp queue disabled — no Redis URL')
    return
  }

  whatsappQueue = new Queue('whatsapp', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 100,   // keep last 100 completed jobs
      removeOnFail: 200,       // keep last 200 failed jobs
    },
  })

  whatsappWorker = new Worker(
    'whatsapp',
    async (job) => {
      const { leadId, phone, message, logId } = job.data
      logger.info('Processing WhatsApp job', { leadId, jobId: job.id })

      await sendToWhatsAppAPI(phone, message)

      // Mark as sent in DB
      await query(
        `UPDATE whatsapp_logs SET status='sent', sent_at=NOW() WHERE id=$1`,
        [logId]
      )
      logger.info('WhatsApp sent successfully', { leadId, phone })
    },
    {
      connection,
      concurrency: 3,   // process 3 messages at a time
    }
  )

  whatsappWorker.on('failed', async (job, err) => {
    logger.error('WhatsApp job failed', {
      jobId: job?.id,
      attempt: job?.attemptsMade,
      error: err.message,
    })
    // Update log on final failure
    if (job?.attemptsMade >= job?.opts?.attempts) {
      await query(
        `UPDATE whatsapp_logs SET status='failed', error=$1 WHERE id=$2`,
        [err.message, job.data.logId]
      ).catch(() => {})
    }
  })

  logger.info('WhatsApp queue initialized')
}

// ── Queue a message (returns immediately) ─────────────────
export async function queueWhatsAppMessage(leadId, phone, message) {
  // Always log the attempt
  const logResult = await query(
    `INSERT INTO whatsapp_logs (lead_id, message, status) VALUES ($1, $2, 'queued') RETURNING id`,
    [leadId, message]
  )
  const logId = logResult.rows[0].id

  if (!whatsappQueue) {
    // No queue — send synchronously (dev fallback)
    logger.info('Sending WhatsApp synchronously (no queue)', { phone })
    await sendToWhatsAppAPI(phone, message)
    await query(`UPDATE whatsapp_logs SET status='sent', sent_at=NOW() WHERE id=$1`, [logId])
    return { queued: false, sent: true }
  }

  await whatsappQueue.add('send', { leadId, phone, message, logId })
  return { queued: true, logId }
}

// ── Actual WhatsApp Business API call ─────────────────────
async function sendToWhatsAppAPI(phone, message) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    logger.warn('WhatsApp credentials not set — message not sent', { phone })
    return { simulated: true }
  }

  const url = `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: `91${phone}`,   // India country code
      type: 'text',
      text: { body: message },
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`)
  }

  return response.json()
}

// ── Message templates ─────────────────────────────────────
export const TEMPLATES = {
  welcome: (name) =>
    `Hi ${name}! 💪 Welcome to MD Fitness Gym!\n\nWe received your enquiry and our team will call you within 2 hours.\n\nOr walk in any day for your ₹1 trial pass!\n\n📍 Rohini | Dwarka | Janakpuri\n⏰ 5am–11pm`,

  followUp: (name) =>
    `Hi ${name}! This is MD Fitness Gym following up on your enquiry. When would be a good time to call you? 📞`,

  joined: (name) =>
    `Congratulations ${name}! 🎉 You're now an MD Fitness Gym member. Your transformation journey starts NOW! 💪`,
}
