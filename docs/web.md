# ROGUEON — Website API: Features, Routes & Folder Structure

Scope: Website-facing backend behavior under `/api/v1/*`. Website browsing, cart and checkout support both guests and authenticated customers. Wishlist, saved addresses and order history require an authenticated customer.

The Website API reuses the completed shared authentication, shared products and shared inventory foundations. It does not duplicate Admin or POS business logic.

---

## 1. Ownership and boundaries

| Concern | Owner |
|---|---|
| Customer/staff authentication and Better Auth session | `shared/auth/` |
| Guest cookie/context | `shared/guest-session/` |
| Public product listing, detail and search | `shared/products/` |
| Category browsing | `web/categories/` |
| Guest/customer cart | `web/cart/` |
| Authenticated Wishlist | `web/wishlist/` |
| Authenticated saved addresses | `web/addresses/` |
| Whole-cart checkout | `web/checkout/` |
| Customer/guest order reads | `web/orders/` |
| QR payment proof submission/retry | `web/payments/` |
| Payment verification and Website-order management | `admin/orders/` |
| Stock mutation and audit logging | `shared/inventory/` |

Website code must not:

- Implement staff authentication.
- Implement Admin payment verification.
- Modify POS sales, sync or receipts.
- Write to `product_variants.stockQty` directly.
- Trust client-supplied prices, totals, user IDs, session IDs, roles or statuses.

---

## 2. Guest and authenticated identity

ROGUEON uses two separate cookies:

1. Better Auth session cookie — authenticated identity tied to a `User`.
2. `guest_session_id` — anonymous continuity for a guest cart and guest orders.

The guest cookie is not authentication and has no `userId` behind it.

For Website requests, identity is resolved in this order:

1. If a valid Better Auth session exists, use its verified user ID and role.
2. Otherwise, read `guest_session_id`.
3. If the guest cookie is missing, generate a cryptographically random token and set it as an HTTP-only cookie.

Recommended cookie properties:

- `httpOnly: true`
- `secure: true` in production
- `sameSite: "lax"` when deployment topology permits
- `path: "/"`
- An explicit expiry/max age

The raw guest token must never be accepted from the request body, query string or headers. Persist and compare a one-way hash of it for cart/order ownership.

No dedicated guest-session endpoint is required; Website guest-context middleware can issue the cookie when a Website API request first needs guest context.

---

## 3. Public catalog

### Categories

```http
GET /api/v1/categories
```

Returns the public category tree in deterministic order.

Only public browsing is owned here. Admin category creation, editing and deletion remain under `/api/v1/admin/categories/*`.

### Products

```http
GET /api/v1/products
GET /api/v1/products/:slug
```

The list endpoint supports pagination, searching, filtering and sorting through query parameters:

```http
GET /api/v1/products?page=1&limit=20
GET /api/v1/products?categoryId=category_1
GET /api/v1/products?categorySlug=t-shirts
GET /api/v1/products?search=classic+tee
GET /api/v1/products?sort=newest
GET /api/v1/products?sort=price_asc
GET /api/v1/products?sort=price_desc
GET /api/v1/products?minPrice=1000&maxPrice=5000
GET /api/v1/products?categorySlug=t-shirts&search=classic&sort=price_asc&page=1&limit=12
```

Rules:

- Only `active` products are publicly returned.
- Draft and archived products are excluded regardless of user-supplied filters.
- Product detail is addressed by unique public `slug`.
- The response includes sellable variants with size, color, price and availability.
- Sorting uses a server-side allowlist.
- Prices come from variants, not the Product row.
- Pagination limits are bounded by the server.
- Product search may match product name and SKU according to the shared-products contract.

The homepage reuses the Product endpoint, for example:

```http
GET /api/v1/products?sort=newest&limit=8
```

There is no separate homepage or search endpoint in v1. A future aggregated homepage endpoint may be added only if banners, collections and multiple curated sections require one response.

---

## 4. Cart

Cart routes support both guests and authenticated customers:

```http
GET    /api/v1/cart
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:itemId
DELETE /api/v1/cart/items/:itemId
DELETE /api/v1/cart
POST   /api/v1/cart/merge
```

### Cart ownership

- Authenticated customer: resolve the active cart by `userId`.
- Guest: resolve the active cart by the hash of `guest_session_id` stored in `carts.sessionId`.
- The frontend never sends `cartId`, `userId` or `sessionId`.
- A cart belongs to exactly one user or one guest session, never both or neither.
- There is at most one active cart per user and one per guest session.

### Get cart

```http
GET /api/v1/cart
```

Returns the current cart, items, product/variant display data, current availability and totals calculated from current server-side prices. Cart totals are previews and are recalculated at checkout.

### Add item

```http
POST /api/v1/cart/items
Content-Type: application/json

{
  "variantId": "variant_123",
  "qty": 2
}
```

Rules:

- `qty` is a positive integer.
- The variant and parent product must exist and be sellable.
- A duplicate variant updates the existing row rather than creating another row.
- The server does not accept price or total.

### Update quantity

```http
PATCH /api/v1/cart/items/:itemId
Content-Type: application/json

{
  "qty": 3
}
```

The request sets an absolute quantity. An item ID must belong to the caller's resolved cart.

### Remove item

```http
DELETE /api/v1/cart/items/:itemId
```

### Clear cart

```http
DELETE /api/v1/cart
```

Clears items from the caller's active cart.

### Merge after login

```http
POST /api/v1/cart/merge
```

Authentication is required. The operation reads the authenticated user and guest cookie, merges the guest cart into the user cart, combines duplicate variants according to the approved quantity rule, and removes/empties the guest cart atomically.

The request does not accept identity fields. Repeating the merge must be safe.

---

## 5. Wishlist

Wishlist requires an authenticated customer:

```http
GET    /api/v1/wishlist
POST   /api/v1/wishlist/items
DELETE /api/v1/wishlist/items/:variantId
```

Add request:

```json
{
  "variantId": "variant_123"
}
```

Rules:

- Wishlist items reference variants, matching the approved schema.
- `(userId, variantId)` is unique.
- Adding an existing entry is idempotent or returns the repository's approved conflict response; it never creates duplicates.
- Guests receive `401 Unauthorized`.
- A customer can only read and mutate their own Wishlist.

---

## 6. Saved addresses

Saved-address routes require an authenticated customer:

```http
GET    /api/v1/addresses
POST   /api/v1/addresses
PATCH  /api/v1/addresses/:id
DELETE /api/v1/addresses/:id
PATCH  /api/v1/addresses/:id/default
```

Create/update fields:

```json
{
  "label": "Home",
  "fullAddress": "Itahari-...",
  "city": "Itahari",
  "phone": "98XXXXXXXX",
  "isDefault": true
}
```

Rules:

- Address ownership always comes from the authenticated session.
- A customer cannot access another customer's address.
- Only one default address exists per customer.
- Setting one address as default unsets the previous default atomically.
- Checkout copies the selected address into immutable Order shipping-snapshot fields.
- Editing or deleting a saved address never changes a historical Order's delivery snapshot.

Guests never create reusable Address rows.

---

## 7. Checkout

```http
POST /api/v1/checkout
```

Checkout always uses the caller's entire active cart. There is no partial checkout and no Buy Now shortcut in v1.

The request never contains `cartId`.

### Authenticated checkout request

```json
{
  "shippingAddressId": "address_123"
}
```

The selected address must belong to the authenticated customer.

### Guest checkout request

```json
{
  "guest": {
    "name": "Samyak Raj Subedi",
    "phone": "98XXXXXXXX",
    "fullAddress": "Itahari-...",
    "city": "Itahari"
  }
}
```

Guest delivery information is used once and snapshotted on the Order. It is not saved in `addresses`.

### Checkout transaction

Checkout must execute as one transaction:

1. Resolve the caller's cart from authenticated user ID or guest-cookie hash.
2. Lock the cart row so concurrent checkout requests cannot consume it twice.
3. Re-read cart items inside the transaction.
4. Reject an empty cart.
5. Load all referenced products and variants.
6. Confirm all products/variants are sellable.
7. Validate stock for every item.
8. Read current prices from the database.
9. Compute subtotal, shipping fee and total on the server.
10. Generate a unique order number.
11. Create the Order with `status: pending` and `paymentStatus: unpaid`.
12. Snapshot delivery information on the Order.
13. Create OrderItem rows with product/variant display snapshots and price snapshots.
14. Create the initial Payment attempt with `status: awaiting_proof` and the exact order total.
15. Clear the cart.
16. Commit.

Checkout validates stock but does not reserve or deduct it. Stock is revalidated and decremented through shared inventory only when an Admin confirms payment.

### Duplicate checkout protection

Explicit checkout idempotency keys are out of scope for the MVP. Duplicate-order prevention relies on cart-row locking and consuming the cart in the same transaction. The frontend must also disable repeated submission while checkout is pending.

### Shipping fee

The server calculates `shippingFee`; the frontend never supplies it. The exact flat or city-based calculation must be confirmed before implementation. Until confirmed, do not invent a shipping-fee formula.

### Static QR configuration

The QR image is stored in Cloudinary/S3 or equivalent media storage. Its public URL and merchant instructions are supplied through validated backend environment variables:

```env
PAYMENT_QR_IMAGE_URL=
PAYMENT_PROVIDER_NAME=
PAYMENT_ACCOUNT_NAME=
PAYMENT_ACCOUNT_IDENTIFIER=
PAYMENT_INSTRUCTIONS=
```

The QR is not stored as binary data in PostgreSQL and is not hardcoded in the frontend. No Admin QR-management endpoint exists in v1.

### Checkout response

```json
{
  "order": {
    "id": "order_123",
    "orderNumber": "ORD-0042",
    "status": "pending",
    "paymentStatus": "unpaid",
    "subtotal": "3500.00",
    "shippingFee": "100.00",
    "total": "3600.00"
  },
  "payment": {
    "status": "awaiting_proof",
    "amount": "3600.00"
  },
  "paymentInstructions": {
    "method": "qr",
    "qrImageUrl": "https://cdn.example.com/rogueon-payment-qr.png",
    "providerName": "Bank Name",
    "accountName": "ROGUEON",
    "accountIdentifier": "XXXXXXXX",
    "amount": "3600.00",
    "reference": "ORD-0042",
    "instructions": "Pay the exact amount and upload the screenshot."
  }
}
```

Money uses the project's established Decimal/string serialization convention.

---

## 8. Orders

```http
GET /api/v1/orders
GET /api/v1/orders/:id
GET /api/v1/orders/:id/payment-instructions
```

### Order history

```http
GET /api/v1/orders?page=1&limit=10&status=confirmed
```

Authentication is required. The endpoint returns only the authenticated customer's orders.

Guests do not have a general order-history endpoint in v1.

### Order detail

```http
GET /api/v1/orders/:id
```

Access is allowed when:

- Authenticated `session.user.id` matches `orders.userId`, or
- The current guest-cookie hash matches `orders.guestSessionId`.

Return Order status, Payment summary, item snapshots, delivery snapshot, tracking reference and timestamps. Possession of an Order ID alone is not authorization.

### Payment instructions

```http
GET /api/v1/orders/:id/payment-instructions
```

Returns the environment-backed QR instructions and the immutable Order amount/reference so the payment screen can recover after refresh. Return instructions only while the Order is eligible for payment or retry.

Guest tracking from a different browser through order number + phone is out of scope for v1.

---

## 9. Payment proof and retries

```http
POST /api/v1/orders/:id/payment-proof
Content-Type: multipart/form-data
```

Multipart fields:

```text
screenshot
```

Optional payer-name or transaction-reference metadata is out of scope unless added to the approved schema.

### Initial proof upload

1. Authorize Order ownership using the authenticated user or guest cookie.
2. Require `orders.status = pending`.
3. Require `orders.paymentStatus = unpaid`.
4. Locate the current `awaiting_proof` Payment attempt.
5. Ensure no Payment attempt is already `pending_verification` or `success`.
6. Validate image MIME type and maximum size.
7. Upload the image through the approved media-storage service.
8. Store only the resulting URL.
9. Change Payment status to `pending_verification`.
10. Keep Order status `pending` and summary payment status `unpaid`.

### Admin confirmation

The completed Admin API owns verification. On confirmation it must revalidate/decrement stock transactionally, then update:

```text
Payment.status        -> success
Order.paymentStatus   -> paid
Order.status          -> confirmed
```

### Admin rejection and retry

On rejection:

```text
Payment.status        -> failed
Order.paymentStatus   -> failed
Order.status          -> pending
```

The rejected Payment remains immutable for audit history.

When the customer submits another proof for an eligible rejected Order, create a new Payment attempt for the same Order and amount, move it to `pending_verification` after successful upload, and set the Order summary back to `unpaid`. Never overwrite the rejected attempt.

Only one Payment attempt may be awaiting proof or pending verification for an Order at one time.

---

## 10. Accepted Website stock limitation

The MVP does not reserve stock at checkout.

Two customers may both validate and pay for the final unit before either proof is confirmed. Admin confirmation must lock/revalidate stock and safely reject the later confirmation when insufficient stock remains. Manual refund/replacement handling is then required.

This prevents unauthorized negative Website stock but does not prevent multiple customers from paying for the final unit. Stock reservation, expiry and automatic release are future work.

---

## 11. Required schema and configuration changes

Before implementing the Website API, update the actual Prisma schema and migrations in a compatibility-safe way:

1. Add `awaiting_proof` to the Payment-status enum.
2. Add nullable indexed `guestSessionId` to Orders.
3. Add `createdAt` and `updatedAt` to Payments.
4. Enforce unique `(cartId, variantId)` CartItem rows.
5. Enforce unique `(userId, variantId)` WishlistItem rows.
6. Enforce at most one cart per `userId` and at most one cart per `sessionId`.
7. Enforce that a cart has exactly one owner: user or guest session.
8. Add immutable delivery snapshot fields to Orders for both guest and authenticated checkout.
9. Add immutable product/variant display snapshot fields to OrderItems while preserving `variantId` and snapshotted price.
10. Add and validate static QR environment variables and update `.env.example`.

Schema changes must preserve existing Admin/POS behavior. Update Admin order reads where necessary to consume Order snapshots and the new Payment status without changing Admin route contracts.

Explicit checkout-idempotency persistence, stock reservations, guest cross-device tracking, automatic expiry and dynamic QR generation remain out of scope.

---

## 12. Folder structure

The Website modules remain flat beneath `web/`. Each endpoint-owning module follows routes → controller → service → repository, with a colocated validation schema when needed.

```text
shared/
├── auth/                         # existing Better Auth integration
├── guest-session/
│   ├── guest-session.middleware.ts
│   ├── guest-session.service.ts
│   └── guest-session.types.ts
├── products/                     # existing shared public/POS catalog reads
│   ├── product.routes.ts
│   ├── product.controller.ts
│   ├── product.service.ts
│   ├── product.repository.ts
│   └── product.schemas.ts
└── inventory/                    # existing shared stock functions

web/
├── web.routes.ts
├── categories/
│   ├── category.routes.ts
│   ├── category.controller.ts
│   ├── category.service.ts
│   ├── category.repository.ts
│   └── category.schemas.ts
├── cart/
│   ├── cart.routes.ts
│   ├── cart.controller.ts
│   ├── cart.service.ts
│   ├── cart.repository.ts
│   └── cart.schemas.ts
├── wishlist/
│   ├── wishlist.routes.ts
│   ├── wishlist.controller.ts
│   ├── wishlist.service.ts
│   ├── wishlist.repository.ts
│   └── wishlist.schemas.ts
├── addresses/
│   ├── address.routes.ts
│   ├── address.controller.ts
│   ├── address.service.ts
│   ├── address.repository.ts
│   └── address.schemas.ts
├── checkout/
│   ├── checkout.routes.ts
│   ├── checkout.controller.ts
│   ├── checkout.service.ts
│   ├── checkout.repository.ts
│   └── checkout.schemas.ts
├── orders/
│   ├── order.routes.ts
│   ├── order.controller.ts
│   ├── order.service.ts
│   ├── order.repository.ts
│   └── order.schemas.ts
└── payments/
    ├── payment.routes.ts
    ├── payment.controller.ts
    ├── payment.service.ts
    ├── payment.repository.ts
    └── payment.schemas.ts
```

The guest-session helper is infrastructure rather than an endpoint-owning business module, so it does not require artificial controller/repository files.

Reuse the actual existing shared-products implementation and naming. Do not create a duplicate Product data-access layer merely to match this illustrative tree.

---

## 13. Router wiring

```ts
// web/web.routes.ts
import { Router } from "express";
import { categoryRouter } from "./categories/category.routes.js";
import { cartRouter } from "./cart/cart.routes.js";
import { wishlistRouter } from "./wishlist/wishlist.routes.js";
import { addressRouter } from "./addresses/address.routes.js";
import { checkoutRouter } from "./checkout/checkout.routes.js";
import { orderRouter } from "./orders/order.routes.js";
import { paymentRouter } from "./payments/payment.routes.js";

export const webRouter = Router();

webRouter.use("/categories", categoryRouter);
webRouter.use("/cart", cartRouter);
webRouter.use("/wishlist", wishlistRouter);
webRouter.use("/addresses", addressRouter);
webRouter.use("/checkout", checkoutRouter);
webRouter.use("/orders", orderRouter);
webRouter.use("/orders", paymentRouter); // exposes /:id/payment-proof
```

Application wiring:

```ts
app.use("/api/v1", sharedProductRouter);
app.use("/api/v1", webRouter);
```

Adapt imports/mounting to the existing application so `/api/v1/products` is mounted exactly once and completed Admin/POS routes are not duplicated.

Do not apply a blanket authentication middleware to `webRouter`; it contains public and guest-capable routes. Apply authentication only to Wishlist, saved addresses and authenticated order-history routes. Guest/customer routes use optional-auth plus guest-context resolution.

---

## 14. Validation and security

- Validate all body, path and query input before controllers.
- Bound pagination and quantity values.
- Validate price-filter ranges and sort allowlists.
- Recalculate every price and total on the server.
- Authorize every CartItem, Address, Order and Payment through its owner.
- Never authorize a guest from Order ID alone.
- Validate proof MIME types and size before upload.
- Do not expose internal stack traces, raw database errors, cookies or secrets.
- Avoid returning draft/archived catalog data publicly.
- Rate-limit checkout and payment-proof upload using existing project conventions when available.

---

## 15. Required tests

Cover at least:

- Public category tree.
- Public Product listing, detail, filters, sorting and search.
- Draft/archived Product exclusion.
- Guest cookie creation and reuse.
- Guest and authenticated Cart isolation.
- Cart add/update/remove/clear and duplicate-variant behavior.
- Guest-cart merge.
- Wishlist authentication and uniqueness.
- Address ownership and default-address transitions.
- Guest and authenticated checkout.
- Checkout price/stock revalidation.
- Empty Cart and invalid Address failures.
- Concurrent duplicate-checkout protection through Cart locking.
- Order and OrderItem snapshots.
- Initial `awaiting_proof` Payment.
- Guest and authenticated Order authorization.
- Payment instruction reload.
- Proof validation/upload and transition to `pending_verification`.
- Rejected-payment retry without overwriting history.
- No direct Website stock mutation during checkout/proof upload.
- Regression coverage for completed Admin and POS behavior affected by schema/shared changes.

---

## 16. Out of scope

- Partial Cart checkout.
- Buy Now bypassing the Cart.
- COD unless separately approved.
- Payment gateways or dynamically generated transaction QR codes.
- Admin-editable QR settings.
- Stock reservations and automatic release.
- Automatic expiry/cleanup of unpaid Orders and guest Carts.
- Guest cross-device tracking by order number/phone.
- Customer cancellation, returns and refunds.
- Coupons, promotions or discounts.
- Automated courier integration.
- Telegram payment notifications.
- Checkout idempotency-key persistence.

---

## 17. Open decision

Before implementing checkout totals, confirm the shipping-fee rule:

- Flat fee configured by the backend, or
- City-based fee mapping.

No frontend-provided shipping fee is trusted.
