# ROGUEON — Database Schema

All tables in one shared Postgres database, used by website, POS, and admin. `stockQty` on `product_variants` is the single source of truth for stock, updated only through the shared `incrementStock()` / `decrementStock()` functions, with every change logged in `inventory_logs`.

This supersedes the original PRD schema in the ways noted inline — primarily: `users` + `staff` merged into one `User` table (Better Auth, role-based), guest orders handled via inline fields instead of a saved address, and `payments` reshaped for the static-QR + manual-verification flow.

---

## Auth Tables (Better Auth)

### User
*(merges the original PRD's `users` + `staff` tables)*
Every person who can log in — customer, cashier, or admin — differentiated by `role`.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| name | string | |
| email | string, unique | login identifier for everyone |
| phone | string, nullable | mainly relevant for customers |
| role | enum | `customer` / `cashier` / `admin` |
| isActive | boolean | account access state, defaults to `true` |
| emailVerified | boolean | Better Auth field |
| image | string, nullable | Better Auth profile-image field |
| createdAt | datetime | |
| updatedAt | datetime | |

### Account
Holds the password hash — kept separate from `User` so multiple login methods per user are possible later (e.g. OAuth, if ever added).

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| userId | FK → User.id | |
| accountId | string | user ID for credential accounts; provider account ID for future OAuth |
| providerId | string | `"credential"` for email/password |
| password | string, nullable | hashed; present for credential accounts |
| accessToken | string, nullable | reserved for future providers |
| refreshToken | string, nullable | reserved for future providers |
| accessTokenExpiresAt | datetime, nullable | reserved for future providers |
| refreshTokenExpiresAt | datetime, nullable | reserved for future providers |
| scope | string, nullable | reserved for future providers |
| idToken | string, nullable | reserved for future providers |
| createdAt | datetime | Better Auth field |
| updatedAt | datetime | Better Auth field |

### Session
Created on login, tracks who's actively logged in.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| userId | FK → User.id | |
| token | string | |
| expiresAt | datetime | |
| ipAddress | string, nullable | |
| userAgent | string, nullable | |
| createdAt | datetime | Better Auth field |
| updatedAt | datetime | Better Auth field |

### Verification
Generic temporary-token table — reused for both email verification and password reset.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| identifier | string | typically the email |
| value | string | the token |
| expiresAt | datetime | |
| createdAt | datetime | Better Auth field |
| updatedAt | datetime | Better Auth field |

---

## Customer Tables

### addresses
Saved delivery addresses — **logged-in users only**. Guests never get a row here (see `orders` below for how guest addresses are handled instead).

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| userId | FK → User.id | required |
| label | string | e.g. Home, Office |
| fullAddress | text | |
| city | string | |
| phone | string | contact number for delivery |
| isDefault | boolean | |

---

## Catalog Tables

### categories
Nested product categories, self-referencing.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| name | string | |
| slug | string, unique | used in URLs |
| parentId | FK → categories.id, nullable | for sub-categories |

### products
One row per product concept — no price/stock here (that lives on variants).

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| categoryId | FK → categories.id | |
| name | string | |
| slug | string, unique | |
| description | text | |
| images | json/array | image URLs |
| status | enum | `draft` / `active` / `archived` |
| createdAt | datetime | |

### product_variants
The actual sellable unit — one row per size/color combination.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| productId | FK → products.id | |
| sku | string, unique | looked up by POS search |
| size | string | |
| color | string | |
| price | decimal | |
| stockQty | integer | single source of truth for stock |

### inventory_logs
Insert-only audit trail of every stock change, from any source or direction.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| variantId | FK → product_variants.id | |
| changeQty | integer | positive (stock in) or negative (stock out) |
| reason | enum | `web_order` / `pos_sale` / `restock` / `adjustment` / `initial_stock` |
| source | enum | `website` / `pos` / `admin` |
| referenceId | string | related orderId or saleId |
| createdAt | datetime | |

---

## Cart & Wishlist Tables (website)

### carts
One active cart per logged-in user, or per guest session.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| userId | FK → User.id, nullable | null for guest carts |
| sessionId | string, nullable | tracks guest carts via cookie |
| createdAt | datetime | |

### cart_items
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| cartId | FK → carts.id | |
| variantId | FK → product_variants.id | |
| qty | integer | |

### wishlist_items
Logged-in only, saved-for-later — no `qty`, since it's not a purchase quantity.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| userId | FK → User.id | |
| variantId | FK → product_variants.id | |
| createdAt | datetime | |

---

## Order Tables (website)

### orders
Website orders — guest or logged-in.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| orderNumber | string, unique | shown to customer |
| userId | FK → User.id, nullable | null for guest orders |
| status | enum | `pending` / `confirmed` / `packed` / `shipped` / `delivered` / `cancelled` |
| subtotal | decimal | |
| shippingFee | decimal | |
| total | decimal | |
| paymentMethod | enum | `qr` |
| paymentStatus | enum | `unpaid` / `paid` / `failed` — quick-glance summary, kept in sync with the latest `payments` row |
| shippingAddressId | FK → addresses.id, nullable | used when a logged-in user selects a saved address |
| guestName | string, nullable | used for guest orders — entered fresh, not saved for reuse |
| guestPhone | string, nullable | |
| guestFullAddress | text, nullable | |
| guestCity | string, nullable | |
| trackingRef | string, nullable | manual courier tracking entry |
| createdAt | datetime | |

### order_items
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| orderId | FK → orders.id | |
| variantId | FK → product_variants.id | |
| qty | integer | |
| price | decimal | snapshotted at order time — stays accurate even if the variant's price later changes |

### payments
One row per payment **attempt** on an order — an order can have more than one (e.g. a rejected screenshot followed by a retry).

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| orderId | FK → orders.id | |
| method | enum | `qr` |
| screenshotUrl | string, nullable | uploaded proof of payment |
| status | enum | `pending_verification` / `success` / `failed` |
| amount | decimal | |
| verifiedBy | FK → User.id, nullable | which admin verified it |
| verifiedAt | datetime, nullable | |
| paidAt | datetime, nullable | |

---

## POS Tables

### pos_sales
In-store sales — created together with their items in one atomic transaction.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| saleNumber | string, unique | simple incrementing counter, e.g. `SALE-0001` |
| staffId | FK → User.id | |
| subtotal | decimal | computed server-side from real variant prices, never trusted from the frontend |
| total | decimal | |
| paymentMethod | enum | `cash` / `qr` |
| createdAt | datetime | |

### pos_sale_items
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| saleId | FK → pos_sales.id | |
| variantId | FK → product_variants.id | |
| qty | integer | |
| price | decimal | snapshotted at sale time |

---

## Structural Changes vs. the Original PRD Schema

| Change | Reason |
|---|---|
| `users` + `staff` merged into one `User` table (+ Better Auth's `Account`, `Session`, `Verification`) | Shared, role-based auth via Better Auth — one login system for customer, cashier, and admin |
| `addresses.userId` stays required; `orders` gains `guestName`, `guestPhone`, `guestFullAddress`, `guestCity`; `orders.shippingAddressId` becomes nullable | Guests have no `User` row to own a saved address — their address is one-time-use, stored inline |
| `payments.method` simplified to `qr` | Static QR + manual verification replaces the original eSewa/Khalti gateway plan |
| `payments.gatewayTxnId` dropped | No gateway involved with static QR |
| `payments.screenshotUrl`, `verifiedBy`, `verifiedAt` added | Manual verification needs proof + accountability |
| `pos_sales.staffId` now FK → `User.id` | Staff table merged away, points to the unified table |
