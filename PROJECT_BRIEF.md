# QR Restaurant Ordering SaaS — Project Brief

## 1. Project overview
Build a multi-tenant SaaS web application for restaurants. A customer scans a QR code placed on a table, opens the restaurant's mobile-friendly menu, adds items to a cart, and places an order. Orders appear in the restaurant's kitchen/staff interface. Customers can choose online payment or pay at the counter.

This is a shared platform for multiple restaurants. Each restaurant's users, menu, tables, orders, settings, and reports must be isolated from other restaurants.

## 2. Explicit scope decisions
- Multi-restaurant SaaS.
- Solo developer.
- Start from scratch.
- Architecture: Unified Next.js full-stack application (Next.js App Router + React + TypeScript for both UI and API/backend). Do NOT introduce or revert to NestJS.
- Database: PostgreSQL.
- ORM/migrations: Prisma (use documentation matching the installed major version).
- Payments: online gateway and pay-at-counter.
- Customers order independently after scanning the table QR.
- **No superadmin/platform-admin panel in the current scope.**
- Do not build subscription billing or SaaS plan management in the MVP.
- Keep the architecture extensible so platform administration can be added later, but do not implement it now.

## 3. User-facing panels
### Customer QR menu
- Open from a table-specific QR URL; no app installation.
- Show restaurant identity, categories, items, images, descriptions, prices, variants/add-ons if supported, and availability.
- Cart, quantity controls, item notes, server-calculated totals.
- Place dine-in order linked to a valid table/session.
- Choose online payment or pay at counter.
- Show confirmation and authorized order status.
- Request waiter assistance or bill (MVP can implement these after core ordering).

### Restaurant owner/manager dashboard
- Restaurant profile and settings.
- Manage menu categories and items.
- Set item availability.
- Manage tables and generate/revoke table QR codes.
- View and manage restaurant orders.
- Invite/manage restaurant staff and assign roles.
- View basic order/revenue reports later.

### Kitchen display
- Display incoming orders in real time or near-real time.
- Show order number, table, items, quantities, notes and elapsed time.
- Transition orders through allowed statuses: Pending → Accepted → Preparing → Ready → Served.
- Cancelled orders must be visibly marked.

### Waiter/cashier interface
- View tables and active orders.
- Receive waiter/bill requests.
- Mark food served where permitted.
- Record counter payment only after staff confirms money was collected.
- Can be a later phase after customer ordering and kitchen flow are working.

## 4. Implementation architecture
Use a unified full-stack Next.js project (App Router):
- `src/app`: Next.js pages, layouts, customer QR flows, staff/owner interfaces, and Route Handlers (`src/app/api/...`).
- `src/lib`: Core services, Prisma client singleton, authentication, role guards, and business logic.
- `src/types`: Domain types, enums, API request/response contracts.
- `prisma`: Database schema and migrations.
- `infra`: Local Docker Compose and deployment configuration.
- `docs`: Project documentation.

Use a unified Next.js modular monolith. Do NOT use NestJS or split into multiple separate server apps. Core domains:
- auth & sessions
- users
- restaurants
- memberships & roles
- menu & categories
- tables & QR tokens
- table sessions
- orders & order items
- kitchen / KDS
- payments & webhooks
- realtime (WebSockets / SSE)
- reports (later)

Suggested tools:
- pnpm
- Next.js (App Router)
- PostgreSQL
- Prisma ORM
- WebSockets / Server-Sent Events for live order updates
- Docker Compose for local PostgreSQL
- Payment gateway such as Razorpay after the basic flow is stable
- Object storage for food images

## 5. Multi-tenancy and security
- Every restaurant-owned record must be associated with a restaurant ID.
- Every authenticated API request must verify the user's membership and role for the target restaurant.
- Never trust a restaurant ID, price, total, role, or order status supplied by the browser.
- All queries and mutations must be tenant-scoped.
- Use database constraints/composite foreign keys where practical to prevent cross-tenant relationships.
- Consider PostgreSQL Row-Level Security as additional defense after the basic implementation is working.
- QR tokens should be opaque, randomly generated, stored as hashes, and revocable.
- A QR token identifies a table but does not prove physical presence. Add table sessions or another server-side validation mechanism.
- Validate item availability, quantities, variants, add-ons, taxes and totals on the backend.
- Use transactions for order creation and idempotency keys to avoid duplicate submissions.
- Store secrets in ignored environment files; commit only `.env.example`.
- Add rate limiting, input validation, audit logging for important actions, backups and monitoring before production.

## 6. Core data model
Start with:
- `User`
- `Restaurant`
- `RestaurantMembership`
- `MenuCategory`
- `MenuItem`
- `RestaurantTable`
- `TableQrToken`
- `TableSession`
- `Order`
- `OrderItem`
- `Payment`
- `PaymentEvent`
- `OrderStatusHistory`

Add variants/add-ons, refunds, subscriptions, inventory, customer feedback and analytics only when needed.

Data rules:
- Use UUIDs or similarly robust identifiers.
- Use integer minor units for money (e.g. paise for INR), not floating-point values.
- Snapshot item names, prices, selected options and applicable charges in order records.
- Keep order status separate from payment status.
- Ensure a table and all order items belong to the same restaurant as the order using suitable database constraints.
- Use unique restaurant-scoped order numbers and idempotent payment webhook processing.

Suggested order statuses:
`PENDING`, `ACCEPTED`, `PREPARING`, `READY`, `SERVED`, `CANCELLED`.

Suggested payment statuses:
`UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`.

Payment methods:
`ONLINE`, `COUNTER`.

## 7. Initial API surface
Prefix: `/api/v1`

Health:
- `GET /health`

Restaurant/menu (protected routes require membership and role checks):
- `POST /restaurants`
- `GET /restaurants/:restaurantId`
- `POST /restaurants/:restaurantId/categories`
- `GET /restaurants/:restaurantId/menu`
- `POST /restaurants/:restaurantId/menu-items`
- `PATCH /restaurants/:restaurantId/menu-items/:itemId`
- `POST /restaurants/:restaurantId/tables`
- `POST /restaurants/:restaurantId/tables/:tableId/qr`
- `POST /restaurants/:restaurantId/tables/:tableId/qr/rotate`

Public/customer:
- `GET /public/restaurants/:slug/menu`
- `GET /public/tables/resolve/:token`
- `POST /public/table-sessions`
- `POST /public/orders`
- `GET /public/orders/:orderId` (must require a valid scoped customer/order token or session)

Staff/kitchen:
- `GET /staff/orders`
- `POST /staff/orders/:orderId/accept`
- `POST /staff/orders/:orderId/start`
- `POST /staff/orders/:orderId/ready`
- `POST /staff/orders/:orderId/served`
- `POST /staff/orders/:orderId/cash-payment` (authorized cashier/manager only)

Payments (later milestone):
- `POST /public/orders/:orderId/payment-intent`
- `POST /webhooks/payments/:provider`

These routes are a starting contract; adjust names consistently as implementation evolves. Never allow arbitrary client-side status changes.

## 8. Payment rules
- Counter orders start as unpaid; a staff member records payment only after collection.
- Online payment is successful only after trusted server-side gateway verification, normally through a signature-verified webhook and/or server-to-server verification.
- Do not trust a browser redirect as proof of payment.
- Deduplicate provider webhook events and handle retries.
- Do not double-create orders or double-count payments.
- Decide whether online orders reach the kitchen only after payment or after staff acceptance. Make the policy explicit.
- Test gateway sandbox mode before production credentials.

## 9. Development phases
### Phase 1 — Foundation
- Create unified full-stack Next.js project, environment files and Docker PostgreSQL.
- Configure Prisma and first migration.
- Add health endpoints (/api/v1/health and /health) and database connectivity checks.
- Add linting, type-checking and automated tests.

### Phase 2 — Tenant and menu
- Implement users, restaurant onboarding and memberships.
- Add owner/manager authorization guards.
- Implement category and menu item CRUD.
- Build basic menu UI.

### Phase 3 — Tables and QR
- Implement tables and opaque QR tokens.
- Add token revocation/rotation.
- Build public QR menu route.
- Add table sessions and validation.

### Phase 4 — Orders and kitchen
- Build cart and checkout.
- Recalculate prices on the server.
- Create order and item snapshots transactionally.
- Add allowed order transitions and status history.
- Build kitchen queue and live updates.

### Phase 5 — Payments and staff
- Add online gateway sandbox flow and verified webhooks.
- Add counter settlement.
- Add waiter requests, bill requests and staff panel.
- Add cancellation/refund workflows as appropriate.

### Phase 6 — Production readiness
- Test tenant isolation, permissions, concurrency and payment edge cases.
- Configure production hosting, secure environment variables, backups and monitoring.
- Pilot with one restaurant, then onboard a second tenant to validate isolation.

## 10. MVP acceptance criteria
- A restaurant owner can create a restaurant and manage menu items.
- The owner can create tables and generate unique QR codes.
- Scanning a QR opens the correct restaurant and table.
- A customer can submit an order without installing an app.
- Server-side totals match the selected menu items.
- The order appears on the kitchen screen and status changes are reflected to the customer.
- Counter payment remains unpaid until confirmed by authorized staff.
- Online payment is not marked paid based only on a browser redirect.
- Duplicate requests/webhooks do not duplicate orders or payments.
- Two restaurants cannot access each other's records.
- Invalid QR tokens, unavailable items, unauthorized transitions and invalid quantities are rejected.

## 11. Working rules for AI coding tools
- Read this file before making changes.
- Inspect the current repository before editing; do not assume it is empty.
- **Architectural Constraint**: Use a unified Next.js full-stack application (Next.js App Router, Route Handlers, Server Actions, React, TypeScript, Tailwind CSS, Prisma). **Do NOT introduce or revert to NestJS or an external backend service.** Both UI and API routes reside in the single Next.js project.
- Work in small, testable milestones.
- Do not implement a superadmin panel.
- Do not implement all features in one giant change.
- Preserve existing working code and avoid unrelated rewrites.
- Explain the files changed and commands to run.
- Add or update tests for each feature.
- Run lint, typecheck, tests and build when applicable; report failures honestly.
- Never hardcode secrets or commit `.env` files.
- Do not claim a feature works unless it was actually implemented and verified.
- Ask before destructive changes, deleting data, changing major architecture, or adding costly external services.
