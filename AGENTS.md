# ROGUEON Backend — Agent Instructions

## Project overview

ROGUEON uses one TypeScript and Express backend with one PostgreSQL database.

The backend supports three application surfaces:

* Website — customer browsing, cart, checkout and website orders
* POS — in-store sales operated by cashiers
* Admin — catalog, staff, stock, orders and reporting

All three surfaces use the same database and shared inventory source of truth.

Do not create a new backend project. Inspect and extend the existing project.

---

## Required documentation

Before planning or implementing backend changes, read the documentation relevant to the task:

1. `docs/prd.md` — product objectives, requirements and business rules
2. `docs/schema.md` — database entities, fields and relationships
3. `docs/flow.md` — application and business flows
4. `docs/admin.md` — Admin API routes, modules and ownership
5. `docs/pos.md` — POS API contract, modules and ownership
6. `docs/current-milestone.md` — the current approved implementation scope

For changes involving project foundations, authentication, database models or shared modules, read all six files.

If documentation conflicts with existing code, report the conflict before making changes.

If two documents conflict, identify the conflicting sections and request a decision. Do not silently choose one.

Do not invent requirements that are not present in the documentation.

---

## Task scope

The active task scope is provided in the user's prompt.

Only implement the explicitly requested modules and features.

Do not expand into another module merely because it is documented.

Documentation describes the complete system, not the scope of every task.

---

## Developer ownership

The current developer owns:

* Backend foundation and configuration
* `src/configs/`
* `src/shared/`
* `src/admin/`
* `src/web/`

Another backend developer owns:

* `src/pos/`

Do not implement or modify POS business functionality unless explicitly requested.

Reading POS code and documentation is allowed when necessary to understand shared contracts or prevent breaking changes.

Changes to authentication, database models, inventory contracts, shared product contracts or other shared interfaces must remain compatible with the POS developer’s work.

Before changing a shared contract, explain:

* What is changing
* Why it is necessary
* Which modules depend on it
* Whether the other developer must update their code

---

## Repository structure

The intended top-level source ownership is:

```text
src/
├── configs/    # environment, logger and application configuration
├── shared/     # shared authentication, products and inventory logic
├── admin/      # Admin API
├── pos/        # POS API, owned by the other backend developer
├── web/        # Website API
├── app.ts      # Express application construction and router mounting
└── server.ts   # application startup and server listening
```

Preserve the existing project structure unless a structural change is necessary.

Do not rename or reorganize existing directories only because another style is preferred.

Do not replace existing configuration without explaining why the existing implementation is insufficient.

---

## Application routing

The intended top-level route prefixes are:

* `/api/v1/admin/*` — Admin API
* `/api/v1/pos/*` — POS API
* `/api/v1/*` — shared or Website API routes

`app.ts` should mount each top-level router once.

Module routers should define only their own portion of the route.

For example:

```ts
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/pos", posRouter);
```

Avoid duplicating route prefixes inside child routers.

Static routes must be declared before conflicting parameter routes.

For example:

```ts
router.get("/pending-payments", handler);
router.get("/:id", handler);
```

---

## Module architecture

Business modules follow this four-layer architecture:

```text
routes -> controller -> service -> repository
```

Every business module should use the same structure unless the current milestone explicitly approves an exception.

### Routes

Routes are responsible for:

* HTTP methods and paths
* Request validation middleware
* Authentication middleware
* Authorization middleware
* Calling controller handlers

Routes must not contain business logic or Prisma queries.

### Controllers

Controllers are responsible for:

* Reading validated request input
* Reading authenticated user context
* Calling services
* Translating service results into HTTP responses

Controllers must not contain Prisma queries.

Controllers should remain thin.

### Services

Services are responsible for:

* Business rules
* Business-level validation
* Calculations
* Transaction orchestration
* Calling repositories
* Calling shared services

Services must not directly depend on Express request or response objects.

### Repositories

Repositories are responsible for database operations.

Prisma queries belonging to a business module must live in its repository layer.

Repositories must not contain HTTP concerns.

---

## Authentication and authorization

Authentication belongs under:

`src/shared/auth/`

Authentication must be reusable by the Website, POS and Admin APIs.

Supported user roles are:

* `customer`
* `cashier`
* `admin`

Authentication and authorization must remain separate concerns.

Expected behavior:

* Missing or invalid authentication returns `401 Unauthorized`
* Valid authentication with an invalid role returns `403 Forbidden`

Expected route boundaries:

* Admin routes allow only `admin`
* POS routes allow `cashier` and `admin`
* Website routes must not receive a blanket Admin or POS role restriction

Do not trust a user ID or role supplied in request parameters, query parameters or request bodies.

Use the authenticated session and server-verified user data.

Do not log:

* Passwords
* Password hashes
* Session tokens
* Cookies
* Authorization headers
* Authentication secrets
* Reset or verification tokens

---

## Database and Prisma

PostgreSQL is the primary database.

Prisma is the database access layer.

PostgreSQL and Redis are available locally through Docker Compose.

Before changing the Prisma schema, explain:

* The proposed schema change
* Why it is required
* Which features depend on it
* Compatibility implications
* Migration requirements
* Potential data-loss risks
* Rollback considerations

Do not create or apply a migration until the schema change has been reviewed when the task requests a plan-first workflow.

Do not delete or reset a development or production database unless explicitly authorized.

Generated Prisma clients and generated build output must not be committed unless the repository explicitly requires them.

---

## Transactions

Operations that create or modify multiple related records must be atomic when partial completion would produce invalid state.

The service layer orchestrates transactions.

Repositories should be capable of using the Prisma transaction client supplied by a service when required.

Examples of operations that will require transaction review include:

* Creating an order and its order items
* Creating a POS sale and its sale items
* Updating stock and creating an inventory log
* Verifying a payment and changing an order
* Creating a product variant with initial stock

Do not perform part of a transaction through the normal Prisma client and another part through a transaction client.

---

## Shared inventory

Stock on product variants is the shared inventory source of truth for Website, POS and Admin.

Future stock mutations must go through shared inventory logic under:

`src/shared/inventory/`

Admin, Website and POS modules must not independently update stock quantities.

Shared inventory logic must support consistent:

* Stock increments
* Stock decrements
* Manual adjustments
* Inventory audit logging
* Transaction participation

Live sales and offline POS synchronization may have different insufficient-stock rules. Follow the finalized documentation and report conflicts instead of assuming behavior.

---

## Request validation

Validate external input before it reaches business logic.

Validation should cover relevant:

* Request bodies
* Path parameters
* Query parameters
* Enumerated values
* Pagination values
* Date ranges
* Quantities
* Identifiers

Request-shape validation belongs at the HTTP boundary.

Business-rule validation belongs in services.

Do not trust prices, totals, roles, ownership fields or stock values supplied by a client when the server can determine them.

---

## Error handling

Use centralized error handling.

Do not expose stack traces or internal implementation details in production responses.

Use consistent status-code semantics:

* `400` — malformed or invalid request
* `401` — unauthenticated
* `403` — authenticated but forbidden
* `404` — resource not found
* `409` — state or uniqueness conflict
* `422` — valid request shape that violates an applicable business rule
* `500` — unexpected internal error

Expected operational errors should not be reported as generic internal errors.

Log enough context to diagnose failures without logging secrets or unnecessary personal data.

---

## Configuration and environment variables

Environment variables must be loaded and validated centrally.

Do not call `dotenv.config()` independently in multiple application modules.

Application code should consume validated environment configuration instead of accessing `process.env` throughout the codebase.

When adding or changing environment variables:

* Update the environment validation schema
* Update `.env.example`
* Update setup documentation when necessary
* Never add real secrets to `.env.example`

Local `.env` files must not be committed.

Development Docker credentials must never be treated as production credentials.

The database hostname and port depend on where the Node application runs:

* Backend running on the host machine uses the exposed host port
* Backend running inside Docker Compose uses the Compose service hostname and container port

Do not mix these configurations.

---

## Logging

Use the shared logger instead of unnecessary `console.log` calls.

The logger must consume validated environment configuration.

Production logs must avoid secrets and sensitive authentication data.

Do not create multiple independent environment-loading paths solely for logging.

---

## TypeScript and modules

Preserve strict TypeScript checking.

The project currently uses NodeNext module behavior. Inspect `package.json`, `tsconfig.json` and existing imports before adding files.

Maintain a consistent ESM or CommonJS convention across the project.

Do not mix incompatible import styles.

When NodeNext requires file extensions in relative imports, follow the existing project convention consistently.

Avoid unsafe `any` types. If an external library forces an unsafe boundary, keep it narrow and document the reason.

Do not weaken strict TypeScript settings merely to make an error disappear.

---

## Security

Never commit:

* `.env`
* Passwords
* Authentication secrets
* API keys
* Production credentials
* Private certificates
* Database dumps containing private data

Do not return password hashes, authentication secrets or session tokens in ordinary API responses.

Use secure password and session functionality provided by the approved authentication library.

Do not implement custom cryptography when an approved library already handles it.

Authorization must be enforced by backend middleware and services, never only by a frontend interface.

---

## Git and collaboration

Keep changes scoped to the current milestone.

Do not modify unrelated files.

Do not modify POS-owned business files without explicit approval.

Do not overwrite another developer’s changes.

Do not run destructive Git commands such as:

```bash
git reset --hard
git clean -fd
git checkout -- .
```

unless explicitly authorized.

Do not commit automatically unless explicitly requested.

Before reporting completion, summarize:

* Files created
* Files modified
* Database migrations created
* Dependencies added or removed
* Commands run
* Test results
* Remaining issues
* Decisions that may affect the other developer

---

## Generated and private files

The following must not be tracked:

* `.env`
* `node_modules/`
* `dist/`
* Build artifacts
* Log files
* Local database files
* Temporary uploads
* Coverage output

Do not modify `.gitignore` without first inspecting its existing rules.

---

## Working process

For substantial tasks:

1. Read `AGENTS.md`.
2. Read `docs/current-milestone.md`.
3. Read the relevant product documentation.
4. Inspect the existing implementation.
5. Identify conflicts, missing requirements and assumptions.
6. Propose the exact files to create or modify.
7. Wait for approval when instructed not to edit yet.
8. Implement only the approved scope.
9. Run relevant verification commands.
10. Review the resulting diff.
11. Report results and unresolved issues.

Do not claim a command passed unless it was actually executed successfully.

Do not claim a feature is complete based only on generated code.

---

## Commands

Inspect `package.json` before running project commands.

Use scripts that actually exist in `package.json` for:

* Development
* Build
* Type checking
* Linting
* Formatting
* Testing
* Prisma client generation
* Prisma migrations

Do not invent npm script names and report them as commands that were run.

Local infrastructure commands include:

```bash
docker compose up -d
docker compose ps
docker compose logs postgres
docker compose logs redis
```

Docker Compose currently starts PostgreSQL and Redis. It does not necessarily start the Node application.

---

## Testing expectations

Add or update tests for changed behavior when test infrastructure exists or is part of the current milestone.

Authentication and authorization testing should cover:

* Request without authentication
* Invalid or expired session
* Valid customer session
* Valid cashier session
* Valid admin session
* Customer denied from Admin routes
* Cashier denied from Admin routes
* Cashier allowed on POS routes
* Admin allowed on Admin routes
* Admin allowed on POS routes

Business modules should test:

* Successful behavior
* Validation failures
* Authorization failures
* Resource-not-found behavior
* State conflicts
* Transaction rollback where relevant

---

## Completion criteria

Before reporting a milestone or implementation complete:

* TypeScript compilation succeeds
* The production build succeeds
* Relevant tests pass
* Linting and formatting checks pass when configured
* Environment variables are documented
* No secrets are tracked
* No generated dependencies or build output are tracked
* Relevant documentation is updated
* The implementation stays within the current milestone
* Changes do not unnecessarily block the POS developer
* Remaining risks and unresolved decisions are reported

If verification cannot be run, clearly state what was not run and why.
