# DineFlow QR SaaS — Production Deployment & Operations Guide

## 1. Overview & Architecture

DineFlow QR is a unified full-stack multi-tenant restaurant application built on:
- **Framework**: Next.js 14 App Router (React 18, TypeScript)
- **Database**: PostgreSQL 16+ (Prisma ORM 5.22)
- **Styling**: Tailwind CSS
- **Authentication**: JWT with HTTP-only secure cookies and SHA-256 password hashing
- **Payments**: Razorpay Gateway (online checkout) & staff Counter Settlement (cash/card/UPI)
- **Security**: Cryptographic QR bearer tokens (SHA-256 hashed in DB), tenant isolation, sliding-window rate limiting, and HTTP security headers

---

## 2. Environment Variables Specification

Ensure all variables are configured in production environment (never commit `.env` to version control):

| Variable | Description | Example / Recommended Value |
|---|---|---|
| `NODE_ENV` | Environment mode (`production`, `development`) | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@db-host:5432/db_name?schema=public&sslmode=prefer` |
| `JWT_SECRET` | Secret key for signing session tokens (min 32 chars) | Generated via `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | Canonical public base URL | `https://dineflow.yourdomain.com` |
| `NEXT_PUBLIC_API_URL` | Canonical API base URL | `https://dineflow.yourdomain.com/api/v1` |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID (Live mode starts with `rzp_live_`) | `rzp_live_xxxxxxxxxxxxxx` |
| `RAZORPAY_KEY_SECRET` | Razorpay API Secret | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Webhook Secret for HMAC verification | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`| Client-safe key for checkout modal | `rzp_live_xxxxxxxxxxxxxx` |

---

## 3. Database Migration & Deployment Procedures

### First-Time Deployment
1. Provision a PostgreSQL 16+ instance (AWS RDS, Supabase, Neon, or Railway).
2. Configure `DATABASE_URL` in environment.
3. Apply migrations to the production database:
   ```bash
   pnpm db:deploy
   # Equivalent to: prisma migrate deploy
   ```
4. Generate the Prisma Client:
   ```bash
   pnpm db:generate
   ```

### Rolling Updates
- For continuous integration (CI/CD):
  ```bash
  pnpm install --frozen-lockfile
  pnpm typecheck
  pnpm test --run
  pnpm build
  pnpm db:deploy
  ```
- **Zero-Downtime Rule**: Never alter existing column types in backwards-incompatible ways. Apply additive migrations first, deploy code, then deprecate old fields in subsequent migrations.

---

## 4. Production Webhook Configuration (Razorpay)

1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Navigate to **Settings** → **Webhooks** → **Add New Webhook**.
3. Set the **Webhook URL** to:
   ```
   https://dineflow.yourdomain.com/api/v1/webhooks/razorpay
   ```
4. Enter your secret in the **Secret** field and set the same value in `RAZORPAY_WEBHOOK_SECRET`.
5. Subscribe to the following events:
   - `payment.captured`
   - `order.paid`
   - `payment.failed`
   - `refund.processed`
6. Webhook signatures are verified using `X-Razorpay-Signature` against the raw payload via `crypto.timingSafeEqual`. Duplicate webhook deliveries are idempotently recorded by unique `eventId`.

---

## 5. Security & Sensitive Data Redaction

1. **Password & Token Protection**:
   - Passwords are salted and hashed using `bcryptjs` with work factor 10.
   - Raw QR tokens are never stored; only one-way SHA-256 hashes are persisted in `table_qr_tokens`.
2. **Error Log Sanitization**:
   - `handleApiError` suppresses internal server error messages and database details when `NODE_ENV === 'production'`.
   - Logging redactions ensure passwords, JWT secrets, and payment credentials are never emitted into stdout or system logs.
3. **HTTP Security Headers**:
   - Configured in `next.config.mjs` including `Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, and `Permissions-Policy`.
4. **Rate Limiting**:
   - In-memory sliding-window rate limiting is active on `/api/v1/auth/login` (10/min), `/api/v1/auth/register` (5/min), `/api/v1/public/orders` (30/min), and `/api/v1/public/orders/[orderNumber]/pay` (15/min).

---

## 6. Backup & Disaster Recovery Procedures

### Automated Daily PostgreSQL Backup
Run scheduled backups using `pg_dump`:
```bash
# Automated cron backup script
BACKUP_DIR="/var/backups/postgres"
DATE=$(date +\%Y\%m\%d_\%H\%M\%S)
FILENAME="dineflow_backup_${DATE}.sql.gz"

pg_dump -h localhost -U restaurant_admin -d restaurant_saas_db | gzip > "${BACKUP_DIR}/${FILENAME}"

# Retain backups for 30 days
find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +30 -delete
```

### Database Restore Procedure
In event of data recovery or failover:
```bash
# 1. Terminate active connections
psql -U restaurant_admin -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'restaurant_saas_db' AND pid <> pg_backend_pid();"

# 2. Re-create clean database
psql -U restaurant_admin -d postgres -c "DROP DATABASE IF EXISTS restaurant_saas_db;"
psql -U restaurant_admin -d postgres -c "CREATE DATABASE restaurant_saas_db;"

# 3. Restore from compressed archive
gunzip -c /var/backups/postgres/dineflow_backup_YYYYMMDD_HHMMSS.sql.gz | psql -U restaurant_admin -d restaurant_saas_db

# 4. Verify migration status
pnpm db:deploy
```

---

## 7. Performance & Real-Time Polling Tuning

- **Kitchen Display System (KDS)**:
  - Default polling interval: `5000ms` (5 seconds).
  - Designed for low-latency updates with 0ms client fetch time on initial load (SSR).
  - Can be adjusted in [KitchenClient.tsx](file:///c:/WorkThings/Projects/restaurant-saas/src/components/kitchen/KitchenClient.tsx) or upgraded to Server-Sent Events (SSE) for enterprise volume.
- **Customer Order Tracking**:
  - Auto-refreshes every `5000ms` while active.
  - Automatically cancels polling once order reaches `SERVED` or `CANCELLED`.
