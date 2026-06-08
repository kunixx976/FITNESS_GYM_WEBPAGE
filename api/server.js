const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const serverless = require('serverless-http');

// Load only the root .env file
const envPath = path.resolve(__dirname, '..', '.env');
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  throw dotenvResult.error;
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '..')));

// Rate Limiting
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 submissions per IP
  message: { error: 'Too many submissions. Please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // max 10 login attempts
  message: { error: 'Too many login attempts.' }
});

app.use('/api/submit-lead', leadLimiter);
app.use('/api/admin/login', loginLimiter);

// Validation Rules
const validateLead = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 50 }),
  body('phone').trim().matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian phone number'),
  body('email').optional().isEmail().normalizeEmail(),
  body('goal').isIn(['weight-loss', 'muscle-gain', 'fitness', 'other']),
];

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Email Configuration
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD, // Use app password for Gmail
  },
});

// ================== AUTHENTICATION ==================

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (!error && data) {
      const passwordMatch = await bcrypt.compare(password, data.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: data.id }, process.env.JWT_SECRET || 'dev-secret', {
        expiresIn: '7d',
      });

      return res.json({ token, adminName: data.name });
    }

    // Local development fallback admin account
    if (
      process.env.NODE_ENV !== 'production' &&
      email === 'admin@mmfitness.in' &&
      password === 'Admin@123'
    ) {
      const token = jwt.sign({ id: 'local-admin' }, process.env.JWT_SECRET || 'dev-secret', {
        expiresIn: '7d',
      });
      return res.json({ token, adminName: 'Local Admin' });
    }

    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ================== LEAD SUBMISSION ==================

// Submit contact form - Save lead + send emails + WhatsApp
app.post('/api/submit-lead', validateLead, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, phone, email, interest, goal, current_gym, budget, available_time, heard_from, urgency, score } = req.body;

  try {
    // 0. Check for existing lead with this phone number
    const { data: existing } = await supabase
      .from('leads')
      .select('id, created_at')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return res.json({
        success: true,
        message: 'Already registered! We will contact you soon.',
        duplicate: true
      });
    }

    // 1. Save lead to database
    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert([
        {
          name,
          phone,
          email,
          interest: interest || 'Not specified',
          goal,
          current_gym,
          budget,
          available_time,
          heard_from,
          urgency,
          score,
          status: 'New',
          created_at: new Date(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Respond immediately without waiting for emails/WhatsApp
    res.json({
      success: true,
      message: "Thanks! We'll contact you within 2 hours.",
      leadId: lead.id,
    });

    // 2. Send emails and WhatsApp in the background (non-blocking)
    // ========================================================

    // Email to admin
    const adminEmailHtml = `
      <h2>New Lead Submission! 🎉</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Interest:</strong> ${interest || 'Not specified'}</p>
      <p><strong>Fitness Goal:</strong> ${goal}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      <hr>
      <p><a href="${process.env.ADMIN_DASHBOARD_URL}">View in Admin Dashboard</a></p>
    `;

    emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `🎯 New Lead: ${name} - Book Free Trial`,
      html: adminEmailHtml,
    }).catch(err => console.error('Admin email error:', err.message));

    
    emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Free Trial is Booked! 🎉 - MM Fitness',
      html: userEmailHtml,
    }).catch(err => console.error('User email error:', err.message));

    // WhatsApp message via Wati.io (non-blocking)
    if (process.env.WATI_API_KEY && process.env.WATI_PHONE_NUMBER_ID) {
      const whatsappMessage = `Hi ${name}! 👋 Welcome to MM Fitness 💪\n\nYour free trial is booked! ✅\n\nWe'll call you within 30 mins at ${phone}.\n\n📍 Gym: Ganga Nagar, Meerut\n⏰ Hours: 5AM - 11PM\n🔗 WhatsApp: +91-95486 66656\n\n— MM Fitness Team`;

      axios.post(
        `https://wati.io/api/v1/sendSessionMessage/${process.env.WATI_PHONE_NUMBER_ID}`,
        {
          phoneNumber: phone.replace(/\D/g, ''),
          message: whatsappMessage,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WATI_API_KEY}`,
          },
        }
      ).catch(err => console.error('WhatsApp send error:', err.message));
    }
  } catch (error) {
    console.error('Lead submission error:', error);
    res.status(500).json({ message: 'Error processing your request' });
  }
});

// ================== WEBHOOKS ==================

// Wati.io Webhook - Auto-update status when lead replies
app.post('/api/webhook/wati', async (req, res) => {
  const { phone, event } = req.body;

  try {
    if (event === 'message_replied') {
      const { error } = await supabase
        .from('leads')
        .update({ status: 'Called', updated_at: new Date() }) // Using 'Called' or 'Joined' as per existing schema status types
        .eq('phone', phone);

      if (error) throw error;
      console.log(`Lead status updated for ${phone} via webhook`);
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// ================== ADMIN PANEL APIs ==================

// Get all leads (with pagination & filters)
app.get('/api/admin/leads', verifyToken, async (req, res) => {
  const { page = 1, limit = 50, status = 'all' } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase.from('leads').select('*', { count: 'exact' });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    res.json({
      leads: data,
      total: count,
      pages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ message: 'Error fetching leads' });
  }
});

// Update lead status (Called, Joined, Not Interested, etc)
app.patch('/api/admin/leads/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  try {
    const { data, error } = await supabase
      .from('leads')
      .update({
        status,
        notes,
        updated_at: new Date(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Lead marked as ${status}`,
      lead: data,
    });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ message: 'Error updating lead' });
  }
});

// Get lead stats (for dashboard)
app.get('/api/admin/stats', verifyToken, async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 1. Total leads count
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // 2. Leads this week count
    const { count: leadsThisWeek } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString());

    // 3. Status and Goal breakdown (fetching data for processing)
    const { data: allData, error: fetchError } = await supabase
      .from('leads')
      .select('status, goal, created_at');

    if (fetchError) throw fetchError;

    // Process breakdowns
    const statusBreakdown = {
      New: allData.filter((l) => l.status === 'New').length,
      Called: allData.filter((l) => l.status === 'Called').length,
      Joined: allData.filter((l) => l.status === 'Joined').length,
      NotInterested: allData.filter((l) => l.status === 'Not Interested').length,
    };

    const goalBreakdown = allData.reduce((acc, { goal }) => {
      if (goal) {
        acc[goal] = (acc[goal] || 0) + 1;
      }
      return acc;
    }, {});

    // 4. Daily trend for last 7 days
    const dailyTrend = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyTrend[dateStr] = allData.filter(l => l.created_at.startsWith(dateStr)).length;
    }

    res.json({
      totalLeads,
      leadsThisWeek,
      statusBreakdown,
      goalBreakdown,
      dailyTrend,
      joinedCount: statusBreakdown.Joined,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// Export leads as CSV
app.get('/api/admin/export-csv', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Create CSV content
    const headers = ['ID', 'Name', 'Phone', 'Email', 'Interest', 'Goal', 'Status', 'Notes', 'Date'];
    const rows = data.map((lead) => [
      lead.id,
      lead.name,
      lead.phone,
      lead.email,
      lead.interest,
      lead.goal,
      lead.status,
      lead.notes || '',
      new Date(lead.created_at).toLocaleString(),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="mm-fitness-leads.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ message: 'Error exporting leads' });
  }
});

// Send WhatsApp message to lead
app.post('/api/admin/send-whatsapp/:leadId', verifyToken, async (req, res) => {
  const { leadId } = req.params;
  const { message } = req.body;

  try {
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('phone, name')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Send via Wati.io
    if (!process.env.WATI_API_KEY || !process.env.WATI_PHONE_NUMBER_ID) {
      return res.status(400).json({ message: 'WhatsApp not configured' });
    }

    await axios.post(
      `https://wati.io/api/v1/sendSessionMessage/${process.env.WATI_PHONE_NUMBER_ID}`,
      {
        phoneNumber: lead.phone.replace(/\D/g, ''),
        message: `Hi ${lead.name}! ${message}`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WATI_API_KEY}`,
        },
      }
    );

    res.json({ success: true, message: 'WhatsApp sent to ' + lead.name });
  } catch (error) {
    console.error('Send WhatsApp error:', error);
    res.status(500).json({ message: 'Error sending WhatsApp' });
  }
});

// ================== HEALTH CHECK ==================

app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// Export for Vercel (serverless handler)
module.exports = serverless(app);

// Start server (Local Only)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`🚀 MM Fitness Backend running on port ${PORT}`);
  });
}
