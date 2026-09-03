# ROGUEON — POS API: Routes & Folder Structure

Scope: `/api/v1/pos/*` — everything the POS app talks to. All routes under this base require `role: cashier` or `role: admin` (an admin can also operate the POS).

Note: staff login goes through `shared/auth/` (same Better Auth flow as everyone else). Product search (by SKU/name, used on the sale screen) goes through `shared/products/` — neither is POS-owned, since both are needed by more than one channel.

---

## 1. The 3 POS Modules

Flat, same depth, same pattern as `admin/`.

| Module | Owns |
|---|---|
| `sales/` | create a sale (+ items, atomic), list own sales, get one sale's detail |
| `offline-sync/` | accept a batch of queued sales pushed after reconnect, commit in order |
| `receipts/` | generate/fetch receipt data for a completed sale (print or digital) |

**Why sales/offline-sync/receipts are separate, not merged:**
- `offline-sync` handles a fundamentally different shape of input (a *batch* of sales, not one) and different failure handling — a live sale either succeeds or fails cleanly; a sync batch can partially succeed, with row-level locking and negative-stock flagging for staff review.
- `receipts` is read-only — formats existing sale data, no writes at all — distinct concern from creating a sale.

---

## 2. Routes

### Sales
```
POST /api/v1/pos/sales        create a sale — items + paymentMethod in the request body,
                                 pos_sales + pos_sale_items created together, atomically,
                                 stock decremented immediately in the same request
GET  /api/v1/pos/sales         paginated sales — scoped to the logged-in cashier's own staffId
GET  /api/v1/pos/sales/:id      get one sale's detail
```
No `PATCH`/`DELETE` — intentional. A completed sale is a finalized, paid transaction; cashiers don't edit or delete history. Corrections (returns/refunds) would be an admin-only action on a separate endpoint, not in scope yet.

**Request shape** (no prices sent from frontend — server looks up real current price):
```json
POST /api/v1/pos/sales
{
  "items": [
    { "variantId": "v1", "qty": 2 },
    { "variantId": "v2", "qty": 1 }
  ],
  "paymentMethod": "cash"
}
```

### Offline sync
```
POST /api/v1/pos/sync         accept a batch of queued sales (recorded locally while offline),
                                 commit each through the same createSale logic, with row-level
                                 locking; flag (not reject) any resulting negative stock for review
```

Each queued sale supplies a stable client-generated UUID and its original occurrence time:

```json
{
  "sales": [
    {
      "clientSaleId": "20000000-0000-4000-8000-000000000001",
      "occurredAt": "2026-08-20T08:15:00.000Z",
      "items": [{ "variantId": "v1", "qty": 2 }],
      "paymentMethod": "cash"
    }
  ]
}
```

`clientSaleId` is unique per staff account. Retrying an identical queued sale returns the existing
sale without creating another inventory change. Reusing the ID for different sale data returns an
item-level conflict. Offline prices are never accepted from the client; synchronization uses the
current database price as the approved small-business policy. Negative stock is allowed for an
offline sale and persists `needsReview: true` for Admin reporting.

### Receipts
```
GET /api/v1/pos/receipts/:saleId      fetch receipt data for a completed sale (print or digital)
```
Not a new record — a formatted read of immutable cashier, product, variant, and price snapshots stored with the sale. Regenerating the same receipt returns the same sale information even if staff or catalog records are edited later. Delivery (print vs. digital) is a frontend concern; the backend just returns one consistent shape.

**Response shape:**
```json
GET /api/v1/pos/receipts/sale_042

{
  "saleNumber": "SALE-0042",
  "cashierName": "Riya",
  "createdAt": "2026-08-15T10:32:00Z",
  "items": [
    { "name": "Classic Tee, Size M, Black", "sku": "TEE-BLK-M", "qty": 2, "price": "1200.00", "lineTotal": "2400.00" },
    { "name": "Classic Tee, Size L, Black", "sku": "TEE-BLK-L", "qty": 1, "price": "1200.00", "lineTotal": "1200.00" }
  ],
  "subtotal": "3600.00",
  "total": "3600.00",
  "paymentMethod": "cash",
  "storeInfo": { "name": "ROGUEON", "address": "..." }
}
```
`items[].price` is the snapshotted price from `pos_sale_items`, not the variant's current live price — a receipt always reflects what was actually charged at sale time.

---

## 3. Folder Structure

Flat, one level deep, same 4-layer pattern (`routes → controller → service → repository`) as every other module.

```
pos/
├── pos.routes.ts                    # combining router — mounts all 3 modules, applies requireRole(["cashier","admin"]) once
│
├── sales/
│   ├── sales.routes.ts
│   ├── sales.controller.ts
│   ├── sales.service.ts             # createSale() — looks up real variant prices, computes subtotal/total,
│   │                                 # generates saleNumber, calls shared/inventory's decrementStock()
│   └── sales.repository.ts          # createSaleWithItems(), getByStaffId(), getById()
│
├── offline-sync/
│   ├── sync.routes.ts
│   ├── sync.controller.ts
│   ├── sync-queue.service.ts        # processes a batch, calls sales.service's createOfflineSale() per item,
│   │                                 # row-level locking, idempotency, and negative-stock review flags
│   └── sync.schemas.ts
│
└── receipts/
    ├── receipts.routes.ts
    ├── receipts.controller.ts
    ├── receipts.service.ts          # formats sale + items into receipt shape
    └── receipts.repository.ts       # reads pos_sales + pos_sale_items for a given saleId
```

---

## 4. Wiring — how the routers mount

```ts
// pos/pos.routes.ts
import { Router } from "express";
import { salesRouter } from "./sales/sales.routes";
import { syncRouter } from "./offline-sync/sync.routes";
import { receiptsRouter } from "./receipts/receipts.routes";
import { requireRole } from "../shared/auth/auth.middleware";

export const posRouter = Router();
posRouter.use(requireRole(["cashier", "admin"]));   // protects everything under /pos, in one place

posRouter.use("/sales", salesRouter);
posRouter.use("/sync", syncRouter);
posRouter.use("/receipts", receiptsRouter);
```

```ts
// app.ts
import { posRouter } from "./pos/pos.routes";

app.use("/api/v1/pos", posRouter);
```

Same pattern as admin — `app.ts` mounts `/api/v1/pos` once, `pos.routes.ts` composes the 3 sub-routers, each of which only knows its own slice of the path.

---

## 5. What POS deliberately does NOT own

| Concern | Actually lives in |
|---|---|
| Staff login | `shared/auth/` — same Better Auth flow as customer/admin login, `role: cashier` |
| Product/variant search by SKU or name | `shared/products/` — `GET /api/v1/products?search=...`; public/customer responses expose availability only, while authenticated cashier/admin responses also expose `stockQty` for offline POS state |
| Stock increment/decrement | `shared/inventory/` — `sales.service.ts` and `sync-queue.service.ts` both import `decrementStock()`, never write to `stockQty` directly |
