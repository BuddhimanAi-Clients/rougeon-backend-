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
   high-entropy value of at least 32 characters.
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

Email verification and password-reset email delivery are intentionally disabled
until an email provider is selected. The Better Auth verification table is
already present so those flows can be added without redesigning authentication.
Social-login and token-refresh routes are also disabled; the active login method
is email and password only.

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

Do not run development migrations against production. Review generated migration
SQL before applying it, and never commit `.env`, `node_modules`, `dist`, logs, or
generated local artifacts.
