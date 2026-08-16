# ROGUEON — Updated Backend PRD
**Supersedes:** original ROGUEON PRD (schema + auth + payments sections) and reconciles it with the CTO Technical Proposal.
**Scope:** Backend engineering — database, auth, payments, cart/checkout, and stock sync. Folder/module structure is covered separately.

---

## 1. Objective

One store, one shared backend, one Postgres database, two ways to sell:

1. **Website** (rogueon.com) — customers buy online, as a guest or logged in. Cart-based checkout, payment via static QR with manual verification.
2. **POS** (pos.rogueon.com) — a cashier rings up a sale in-store, offline-capable, payment settled immediately at the counter.

A third surface, the **admin panel**, manages products and stock, staff accounts, verifies pending website payments, and views combined sales/inventory insight across both channels.

Stock (`stock_qty` on `product_variants`) is the single source of truth for both channels — a sale from either side updates the same number, inside a transaction, so overselling between website and POS is not possible.

---

## 2. Database Schema

### User (merges the original `users` + `staff` tables)
Every person who can log in — customer, cashier, or admin — differentiated by `role`.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| name | string | |
| email | string, unique | login identifier for everyone |
| phone | string, nullable | mainly for customers |
| role | enum | `customer` / `cashier` / `admin` |
| emailVerified | boolean | Better Auth field |
| image | string, nullable | Better Auth profile-image field |
| createdAt | datetime | |
| updatedAt | datetime | |

### Account (Better Auth)
Holds the password hash — separate from `User` so multiple login methods per user are possible later.

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

### Session (Better Auth)
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

### Verification (Better Auth)
Generic temporary-token table, reused for both email verification and password reset.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| identifier | string | typically the email |
| value | string | the token |
| expiresAt | datetime | |
| createdAt | datetime | Better Auth field |
| updatedAt | datetime | Better Auth field |

### addresses
Saved delivery addresses — **logged-in users only**.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| userId | FK → User.id | required — guests never get a row here |
| label | string | e.g. Home, Office |
| fullAddress | text | |
| city | string | |
| phone | string | contact number for delivery |
| isDefault | boolean | |

### categories
Nested product categories.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| name | string | |
| slug | string, unique | |
| parentId | FK → categories.id, nullable | for sub-categories |

### products
One row per product concept — no price/stock here.

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
The actual sellable unit — one row per size/color combo.

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
Insert-only audit trail of every stock change.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| variantId | FK → product_variants.id | |
| changeQty | integer | positive or negative |
| reason | enum | `web_order` / `pos_sale` / `restock` / `adjustment` |
| source | enum | `website` / `pos` / `admin` |
| referenceId | string | related orderId or saleId |
| createdAt | datetime | |

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
Logged-in only, saved-for-later.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| userId | FK → User.id | |
| variantId | FK → product_variants.id | |
| createdAt | datetime | |

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
| guestName | string, nullable | used for guest orders |
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
| price | decimal | snapshotted at order time |

### payments
One row per payment **attempt** on an order (an order can have more than one attempt, e.g. a rejected screenshot followed by a retry).

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

### pos_sales
In-store sales.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| saleNumber | string, unique | |
| staffId | FK → User.id | |
| subtotal | decimal | |
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

## 3. Auth Model

Shared, role-based auth for everyone — customers, cashiers, and admins — via **Better Auth**. One `User` table, not separate customer/staff tables.

- Login is unified: same email/password flow for customer, cashier, and admin — differentiated by `role`.
- Route access enforced via role-checking middleware (`requireRole([...])`), not by which table a user came from.
- Website browsing and guest checkout require no login. Login is required only for order history, saved addresses, and wishlist.
- POS routes require `role: cashier` or `admin`. Admin routes require `role: admin`.
- Email verification and password reset both use Better Auth's built-in `Verification` token flow — a token is generated and stored, we send the actual email via our own provider, the user clicks the link, Better Auth validates the token and updates the relevant row (`User.emailVerified`, or `Account.password`).

---

## 4. Payment Model

Static QR + manual verification — not a payment gateway.

**Why two payment-status fields:** `payments.status` tracks one specific payment **attempt** (an order can have more than one, e.g. a retried upload). `orders.paymentStatus` is a quick-glance summary on the order itself, kept in sync with the latest payment attempt, so order lists can filter/display without joining into `payments` every time.

**Flow:**
1. Customer checks out from their cart → order is created (stock validated, prices snapshotted) — **no stock deducted yet**. A `payments` row is created at `pending_verification`.
2. Static QR + amount due is shown to the customer.
3. Customer pays externally via their own banking/UPI app.
4. Customer uploads a screenshot of their payment confirmation, tagged to the `orderId`.
5. Order sits at `orders.status: pending`, `orders.paymentStatus: unpaid`, `payments.status: pending_verification`.
6. Admin reviews the order + screenshot in the admin panel, checks the actual bank statement, and confirms.
7. On confirmation: `payments.status → success`, `orders.paymentStatus → paid`, `orders.status → confirmed`, stock is decremented, customer is notified.

POS sales are **not** part of this pending-verification flow — a POS sale is paid and completed at the counter in real time, so stock deducts immediately on sale completion.

---

## 5. Guest Checkout

Guests can browse, add to cart, and complete checkout without an account.

- A guest's cart is tracked via `sessionId` (cookie), not `userId`.
- A guest's shipping address is not saved anywhere reusable — it's entered fresh at checkout and stored inline on the `orders` row (`guestName`, `guestPhone`, `guestFullAddress`, `guestCity`), since a guest has no `User` row to own a saved `addresses` entry.
- A logged-in user instead selects (or adds) a saved `addresses` row, referenced via `orders.shippingAddressId`.
- Wishlist requires login — nothing to persist it against between visits for a guest.

---

## 6. Cart & Checkout

- Cart holds items pre-purchase; wishlist holds items saved-for-later (logged-in only).
- Checkout is **cart-based only** in this phase — the customer adds item(s) to cart, then checks out from the cart page. There is no "click Buy on a product page" shortcut that bypasses the cart.
- **v1 checkout = entire cart.** There is no "select which items to buy" (partial checkout) — if a customer wants to buy only some items, they remove the rest from the cart first, then check out what remains. Partial checkout may be added later without restructuring, by filtering which `cart_items` feed into order creation.
- Checkout step by step:
  1. `POST /checkout` → validates stock for every cart item, snapshots current price into `order_items.price`, creates `orders` + `order_items` + a `payments` row → response returns `orderId` and QR data.
  2. Frontend displays the static QR.
  3. Customer pays externally, then uploads proof via `POST /payments/:orderId/proof`.
  4. Order waits for admin verification (Section 4, steps 5–7).

---

## 7. Stock Sync — Single Source of Truth

All stock changes, from either channel and in either direction, go through **one shared function** and are logged in `inventory_logs`. No module writes to `stockQty` directly.

| Direction | Triggered by | Function |
|---|---|---|
| **Stock IN** | Admin creates a variant (initial stock), restocks, or makes a manual adjustment | `incrementStock()` |
| **Stock OUT** | Admin confirms a website order's payment | `decrementStock()` |
| **Stock OUT** | POS sale is completed | `decrementStock()` |

Both functions are transaction-safe (row-level locking), so two simultaneous sales — one from website, one from POS — cannot both succeed against the same unit of stock. Every change writes an `inventory_logs` row recording what changed, why, from which source, and which order/sale it relates to.

For offline POS sales specifically: sales are queued locally on the device while offline and pushed to the backend once connectivity returns; the backend commits each queued transaction through the same `decrementStock()` function, using row-level locking, and flags any resulting negative stock for staff review rather than silently allowing it.

---

## 8. Out of Scope (this phase)

- Partial cart checkout (select specific items to buy, leave rest in cart)
- "Buy Now" direct-purchase shortcut bypassing the cart
- Telegram bot notification to admin on payment screenshot upload
- Payment gateway integration (eSewa/Khalti) — replaced by static QR
- Automatic expiry/cleanup of abandoned pending orders or stale guest carts
- Multi-store/multi-warehouse logistics
- Automated courier/shipping integration (manual tracking entry only)
- Receipt printing / barcode scanning hardware integration

---

## 9. Open Items for Confirmation

- Whether staff log in via email only, or a separate username field is still wanted.
- Whether COD remains a valid `payments.method` / `pos_sales.paymentMethod` alongside `qr`, or QR is the only method going forward for the website.
- Telegram bot integration timeline, if picked back up post-launch.
