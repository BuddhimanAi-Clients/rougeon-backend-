# Current Milestone: Backend Foundation and Authentication

## Objective

Provide a stable shared backend foundation so the POS developer can begin
working from `main`.

## In scope

- Review and improve existing TypeScript/Express setup
- Environment validation
- Logging configuration
- Prisma/PostgreSQL configuration
- Better Auth integration
- Roles: `customer`, `cashier`, and `admin`
- Reusable authentication middleware
- Reusable role-authorization middleware
- Express app and server wiring
- Minimal top-level Admin, POS and Web routers
- Public health-check endpoint
- Authentication and authorization tests
- Development setup documentation

## Out of scope

- Admin business modules
- POS business modules
- Website business modules
- Products and categories
- Inventory mutations
- Carts and checkout
- Orders and payments
- Sales and offline synchronization
- Receipts and dashboards

## Definition of done

- PostgreSQL runs through Docker Compose
- Prisma connects successfully
- Better Auth works
- Unauthenticated protected requests return `401`
- Invalid roles return `403`
- Admin can access the Admin router
- Cashier and Admin can access the POS router
- Type checking succeeds
- Tests pass
- Production build succeeds
- `.env.example` documents required variables
- Setup instructions are documented