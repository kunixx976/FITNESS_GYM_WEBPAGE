# MD Fitness Gym — Production Backend

Scalable Express.js API with PostgreSQL, Redis caching, WhatsApp job queue, rate limiting, and full security hardening.

## Architecture

```
Client (Netlify) → Railway (Express API) → Neon.tech (PostgreSQL)
                                         → Upstash (Redis cache + BullMQ queue)
                                         → WhatsApp Business API
```

## Project Structure

```
md-fitness-backend/
├── server.js                   ← Entry point, startup, graceful shutdown
├── routes/
│   ├── leads.js                ← POST /api/leads (public)
│   └── admin.js                ← All /api/admin/* routes
├── controllers/
│   ├── leadController.js       ← createLead, getLeads, updateLead, getStats, exportCSV
│   └── adminController.js      ← login, getMe, sendWhatsApp
├── middleware/
│   ├── auth.js                 ← JWT verify + token generation
│   ├── rateLimiter.js          ← Per-route rate limits
│   ├── validator.js            ← Zod schemas + validate() factory
│   └── errorHandler.js         ← 404 + global error handler
├── services/
│   ├── cacheService.js         ← Redis get/set/invalidate helpers
│   └── whatsappService.js      ← BullMQ queue + WhatsApp API calls
├── config/
│   ├── logger.js               ← Winston logger
│   └── redis.js                ← Redis connection + memory fallback
└── db/
    ├── pool.js                 ← PostgreSQL connection pool
    ├── migrate.js              ← Creates all tables and indexes
    └── seed.js                 ← Creates first admin user
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your actual values

# 3. Run database migrations
npm run db:migrate

# 4. Create first admin user
ADMIN_SEED_PASSWORD=yourpassword npm run db:seed

# 5. Start development server
npm run dev

# 6. Test health check
curl http://localhost:5000/health
```

## API Endpoints

### Public
| Method | Path | Description | Rate Limit |
|---|---|---|---|
| POST | `/api/leads` | Submit lead form | 5 per 15 min per IP |
| GET | `/health` | Health check | None |

### Admin (requires Bearer token)
| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/login` | Login, get JWT |
| GET | `/api/admin/me` | Current admin info |
| GET | `/api/admin/stats` | Dashboard stats (cached 5 min) |
| GET | `/api/admin/leads` | Paginated leads list |
| PATCH | `/api/admin/leads/:id` | Update status/notes |
| DELETE | `/api/admin/leads/:id` | Delete a lead |
| GET | `/api/admin/export-csv` | Download CSV export |
| POST | `/api/admin/send-whatsapp/:id` | Queue WhatsApp message |

### Query params for GET /api/admin/leads
```
?page=1&limit=20&status=New&search=rahul&from=2025-01-01&to=2025-12-31
```

## Deploy to Railway (Free)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and create project
railway login
railway init

# 3. Add PostgreSQL and Redis
railway add postgresql
railway add redis

# 4. Set environment variables in Railway dashboard
# Copy from .env.example and fill in values

# 5. Deploy
railway up

# 6. Get your URL
railway domain
```

## Environment Variables

See `.env.example` for full list. Required:
- `DATABASE_URL` — PostgreSQL connection string (from Neon.tech or Railway)
- `JWT_SECRET` — 64-char random string
- `REDIS_URL` — Redis URL (from Upstash or Railway) — optional but recommended

## Security Features

- ✅ Helmet.js security headers
- ✅ CORS — only your frontend domains allowed
- ✅ Rate limiting — per endpoint, per IP
- ✅ Zod input validation on every route
- ✅ JWT auth with expiry (8 hours)
- ✅ Bcrypt password hashing (cost 12)
- ✅ No stack traces in production errors
- ✅ SQL injection prevention (parameterized queries)
- ✅ Request body size limit (10KB)
- ✅ Timing-safe login (prevents username enumeration)

## Scaling Capacity

| Setup | Concurrent Users | Cost |
|---|---|---|
| Railway Hobby + Neon free | ~500/day | ₹0–500/mo |
| Railway Pro + Neon paid | ~10,000/day | ₹2,000/mo |
| Railway + Read replicas + Redis | ~100,000/day | ₹8,000/mo |
