# ROGUEON Backend

Shared TypeScript and Express backend for the ROGUEON Website, POS, and Admin
applications.

## Requirements

- Node.js 24 LTS is recommended. Supported alternatives are listed in
  `package.json#engines`.
- npm
- Docker with Docker Compose

## Local setup

1. Copy `.env.example` to `.env` and replace `BETTER_AUTH_SECRET` with a unique,
   high-entropy value of at least 32 characters. Configure Cloudflare R2 for
   product images and the administrator-managed checkout QR, Resend for
   transactional auth emails, plus `STORE_NAME` and `STORE_ADDRESS` for POS
   receipts.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start PostgreSQL and Redis:

   ```bash
   docker compose up -d
   docker compose ps
   ```

4. Generate Prisma Client and apply reviewed development migrations:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate:dev
   ```

5. Start the API:

   ```bash
   npm run dev
   ```

   On a brand-new database, create the first Admin account once from an
   interactive terminal:

   ```bash
   npm run bootstrap:admin
   ```

   The command hides the password, creates a normal Better Auth credential,
   marks the account verified, and promotes it to `admin`. It refuses while an
   active Admin exists; after that, create cashiers and other Admins through
   the Admin Staff page.

6. In deployments that send transactional email, start the durable email worker separately:

   ```bash
   npm run worker:email
   ```

   Configure `REDIS_URL`, `EMAIL_OUTBOX_ENCRYPTION_KEY`, and the existing Resend variables. Redis jobs carry only an outbox ID; temporary Better Auth action links are encrypted in the database outbox and removed after delivery.

The Node application runs on the host, so the default PostgreSQL URL uses
`localhost:5433`. A Node application running inside Compose would instead use
the `postgres` service on port `5432`.

## API foundation

- Health: `GET /api/v1/health`
- Better Auth base path: `/api/v1/auth`
- Email signup: `POST /api/v1/auth/sign-up/email`
- Email login: `POST /api/v1/auth/sign-in/email`
- Current session: `GET /api/v1/auth/get-session`
- Logout: `POST /api/v1/auth/sign-out`
- Update profile: `POST /api/v1/auth/update-user`
- Change password: `POST /api/v1/auth/change-password`
- List sessions: `GET /api/v1/auth/list-sessions`
- Revoke one session: `POST /api/v1/auth/revoke-session`
- Revoke other sessions: `POST /api/v1/auth/revoke-other-sessions`
- Revoke all sessions: `POST /api/v1/auth/revoke-sessions`
- Admin boundary: `/api/v1/admin/*` (`admin` only)
- POS boundary: `/api/v1/pos/*` (`cashier` or `admin`)

Email verification and password-reset delivery use Resend when its environment
variables are configured. Local development defaults to console-only email; set
`EMAIL_DELIVERY_MODE=resend` alongside Resend and Redis credentials to deliberately
test real email delivery from localhost. Social-login and token-refresh
routes are disabled; the active login method is email and password only.

Self-service email signup always creates a `customer`. The API does not accept a
client-supplied role. Until the Admin staff-management milestone is implemented,
development staff roles can be assigned deliberately through Prisma Studio:

```bash
npm run prisma:studio
```

## Commands

```bash
npm run dev
npm run typecheck
npm run build
npm start
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:migrate:deploy
npm run prisma:studio
```

## Admin API

All Admin routes are mounted under `/api/v1/admin` and require an authenticated
`admin` session. The implemented modules are:

- `/staffs` — staff creation, listing, update, deactivation, and reactivation
- `/categories` — nested category CRUD and deterministic tree listing
- `/products` and `/variants` — catalog and variant management
- `/stock` — restock, manual adjustment, and immutable inventory logs
- `/orders` — Website-order reporting, status changes, and payment verification
- `/payment-settings` — QR image/history management; exactly one configuration is active
- `/pos-sales` — read-only POS sale reporting
- `/dashboards` — Website/POS sales totals and low-stock reporting

Date-only Admin filters and dashboard ranges currently use UTC boundaries.

Integration tests require `TEST_DATABASE_URL` to point to an isolated database
or a schema whose name contains `test`. Apply the existing migrations to that
test target before running `npm run test:integration`. Tests never use the
development schema as a fallback.

Do not run development migrations against production. Review generated migration
SQL before applying it, and never commit `.env`, `node_modules`, `dist`, logs, or
generated local artifacts.

## Website API

Public routes:

- `GET /api/v1/categories`
- `GET /api/v1/products`
- `GET /api/v1/products/:slug`

Guest/customer routes:

- `/api/v1/cart` and `/api/v1/cart/items/*`
- `POST /api/v1/cart/merge` (customer session required)
- `POST /api/v1/checkout`
- `GET /api/v1/orders` and `GET /api/v1/orders/:id` (authenticated users or the same guest browser)
- `GET /api/v1/orders/:id/payment-instructions`
- `POST /api/v1/orders/:id/payment-proof` (JPEG, PNG, or WebP, up to 8 MB)

Customer-only routes:

- `/api/v1/wishlist/*`
- `/api/v1/addresses/*`
- `GET /api/v1/orders`

Website checkout currently applies the backend-configured flat `SHIPPING_FEE`,
which defaults to `150.00`. It requires an active payment QR configuration and
snapshots it on the payment attempt. Checkout creates an `awaiting_proof`
Payment but does not reserve or decrement stock; Admin confirmation remains the
only Website stock decrement operation. Payment screenshots are stored privately
and are available only through an authenticated Admin proof endpoint.

## POS API

All POS routes require an authenticated `cashier` or `admin` session:

- `POST /api/v1/pos/sales` — create an immediate paid sale
- `GET /api/v1/pos/sales?page=1&limit=20` — list the current staff member's sales
- `GET /api/v1/pos/sales/:id` — get an owned sale
- `POST /api/v1/pos/sync` — retry-safe ordered offline-sale synchronization
- `GET /api/v1/pos/receipts/:saleId` — immutable receipt data for an owned sale

Authenticated cashier/admin requests to `GET /api/v1/products` receive exact
variant `stockQty`; public and customer responses expose only `available`.
Offline sync uses current database prices and requires a stable `clientSaleId`
plus the original `occurredAt` timestamp for each queued sale.
