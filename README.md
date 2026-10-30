# DineFlow QR — Modern Restaurant Management & Table Ordering SaaS

[![Next.js](https://img.shields.io/badge/Next.js-14.2.14-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Tests](https://img.shields.io/badge/Tests-123%20Passed-success?style=flat&logo=vitest)](https://vitest.dev/)

A unified, multi-tenant restaurant management and contactless table QR ordering system designed for high concurrency, security, and exceptional dining experiences.

---

## 🌟 Key Features

### 🏢 Multi-Tenant Management & RBAC
- **Self-Service Onboarding:** Fast restaurant workspace registration with automatic slug generation.
- **Role-Based Access Control:** Strict role segregation across `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`, and `CASHIER`.
- **Tenant Isolation:** Enforced at the Prisma/PostgreSQL query level across all protected routes.

### 📱 Contactless QR Code Table Ordering
- **Cryptographic QR Tokens:** Tables generate 256-bit entropy tokens, hashed via SHA-256 before database storage.
- **Secure Table Sessions:** HttpOnly, `SameSite=Lax` dining cookies establish active sessions without exposing bearer tokens to client storage or JavaScript.
- **Dynamic Menus:** Real-time dish availability toggling, category management, and dietary badges (Veg, Non-Veg, Vegan, Gluten-Free).

### 🛒 High-Integrity Cart & Ordering Flow
- **Server-Authoritative Pricing:** Client-submitted prices and totals are completely discarded. All prices, taxes, and totals are computed server-side using authoritative database records.
- **Idempotency Protection:** Client-generated idempotency keys prevent duplicate orders during network retries or double-submissions.
- **Live Status Tracking:** Customer timeline view showing real-time order states (`PENDING` → `ACCEPTED` → `PREPARING` → `READY` → `SERVED`).

### 👨‍🍳 Real-Time Kitchen Display System (KDS)
- **Live Kitchen Board:** Instant ticket displays with color-coded elapsed time indicators.
- **One-Click Progression:** Bump order states with optimistic UI updates and strict state machine validation.

### 💳 Dual Payment Pipeline & Counter Settlement
- **Online Gateway Integration:** Razorpay payment orders, client-side mobile checkout, and raw-body HMAC-SHA256 webhook verification with replay protection.
- **Staff Counter Settlement:** Authoritative cash, UPI, and physical card counter settlements by authorized cashiers and managers.
- **Reconciliation Engine:** Automated verification comparing local payment ledgers against gateway settlement states.

### 🧾 Official Itemized Receipts
- **Cryptographically Scoped Tokens:** Narrowly scoped JWT tokens (`scope: read:receipt`) permit customers to view and print official itemized receipts without granting access to order mutation endpoints.
- **Print & Share Ready:** Clean, branded receipt layout optimized for mobile screens and thermal printers.

---

## 🏗️ Architecture & Security Highlights

| Layer | Implementation Details |
|---|---|
| **Framework** | Next.js 14 App Router with React Server Components (RSC) and strict separation of Server/Client boundaries. |
| **Authentication** | JWT with HttpOnly, Secure, `SameSite=Lax` cookies and bcrypt password hashing. |
| **Session Security** | Ephemeral `table_session` cookie; zero token persistence in `localStorage` or `sessionStorage`. |
| **Database** | PostgreSQL 16+ orchestrated via Prisma ORM with explicit database transactions for all financial operations. |
| **Defense in Depth** | In-memory sliding-window rate limiting, strict Zod schema validation on untrusted inputs, and HTTP security headers (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`). |

---

## 📂 Project Structure

```text
├── infra/                  # Docker Compose configuration (PostgreSQL)
├── prisma/
│   ├── schema.prisma       # Database schema & indexes
│   └── migrations/         # Version-controlled SQL migrations
├── public/                 # Static assets
├── scripts/
│   ├── live-e2e-verification.ts  # End-to-end user journey test runner
│   └── seed-menu.js        # Realistic demo menu seeder
├── src/
│   ├── app/                # Next.js App Router (Pages & API Route Handlers)
│   │   ├── api/v1/         # RESTful API endpoints
│   │   │   ├── auth/       # Authentication (Register, Login, Me, Logout)
│   │   │   ├── public/     # Customer QR menu, session, orders, payments
│   │   │   ├── restaurants/# Protected management APIs (tables, menu, orders)
│   │   │   └── webhooks/   # Gateway webhooks (Razorpay HMAC validation)
│   │   ├── dashboard/      # Restaurant manager & owner dashboard
│   │   ├── kitchen/        # Kitchen Display System (KDS)
│   │   ├── m/[slug]/       # Mobile customer menu, cart, tracking, receipt
│   │   ├── login/          # Staff & owner login
│   │   ├── onboarding/     # Restaurant onboarding
│   │   └── register/       # User registration
│   ├── components/         # Reusable modular UI components
│   │   ├── auth/           # Login & registration forms
│   │   ├── dashboard/      # Dashboard tabs, modals, tables, metrics
│   │   ├── kitchen/        # KDS cards, header, ticket views
│   │   ├── menu/           # Customer menu, cart drawer, order tracking
│   │   └── receipt/        # Receipt actions & printable view
│   ├── hooks/              # Custom React hooks (useCart, useDashboardData)
│   ├── lib/                # Shared utilities & business logic
│   │   ├── auth/           # JWT, passwords, route guards
│   │   ├── orders/         # Order number generator, pricing, state machine
│   │   ├── payments/       # Razorpay client, counter settlement, reconciliation
│   │   ├── qr/             # Cryptographic token hashing, session lifecycle
│   │   └── rate-limit.ts   # Rate limiter with sliding window
│   └── types/              # Domain-wide TypeScript interfaces & types
└── test/                   # Automated Vitest test suites
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `20.x` or higher
- **Package Manager**: `pnpm` (`npm install -g pnpm`)
- **Database**: PostgreSQL 16+ (or Docker)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/AnmolTwari/Restaurant-QR-Ordering.git
cd Restaurant-QR-Ordering
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your PostgreSQL database credentials and JWT secret:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/restaurant_saas_db?schema=public"
JWT_SECRET="generate-a-secure-random-secret-at-least-32-chars"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3000/api/v1"

# Razorpay (Optional for local test-mode development)
RAZORPAY_KEY_ID="rzp_test_placeholder"
RAZORPAY_KEY_SECRET="placeholder_secret"
RAZORPAY_WEBHOOK_SECRET="placeholder_webhook_secret"
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_placeholder"
```

### 3. Start PostgreSQL with Docker
```bash
pnpm docker:up
```

### 4. Apply Database Migrations & Generate Prisma Client
```bash
pnpm db:migrate
pnpm db:generate
```

### 5. Start Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Testing & Verification

The codebase includes comprehensive automated tests covering unit logic, integration routes, tenant boundaries, and end-to-end user journeys:

```bash
# Run all Vitest test suites (123 tests)
pnpm test --run

# Run TypeScript compiler type-checking
pnpm typecheck

# Run Next.js ESLint verification
pnpm lint

# Run optimized production build
pnpm build

# Execute live 14-step E2E journey script
npx tsx scripts/live-e2e-verification.ts
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

