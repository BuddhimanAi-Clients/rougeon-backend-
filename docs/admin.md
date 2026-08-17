# ROGUEON — Admin API: Routes & Folder Structure

Scope: `/api/v1/admin/*` — everything the admin panel talks to. All routes under this base require `role: admin` (enforced once, at the top-level `adminRouter`).

---

## 1. The 8 Admin Modules

Flat, all siblings, same depth — consistent with how `web/` and `pos/` are structured. No nesting.

| Module | Owns |
|---|---|
| `staffs/` | staff account CRUD |
| `categories/` | product category tree (create/edit/delete, supports nesting via `parentId`) |
| `products/` | product CRUD (name, description, images, category, status) |
| `variants/` | variant CRUD (size, color, SKU, price) — created under a product, edited/deleted standalone |
| `stock/` | restock, manual adjustment, inventory audit log |
| `orders/` | website order management + manual payment verification |
| `pos-sales/` | read-only view of POS sales log |
| `dashboards/` | sales insight + low-stock alerts |

---

## 2. Routes

### Staff management
```
POST   /api/v1/admin/staffs              create staff (name, email, initial password, role)
GET    /api/v1/admin/staffs              list all staff
GET    /api/v1/admin/staffs/:id          get one staff's detail
PATCH  /api/v1/admin/staffs/:id          update (name, role, etc.)
DELETE /api/v1/admin/staffs/:id          deactivate/remove
PATCH  /api/v1/admin/staffs/:id/reactivate reactivate a deactivated staff account
```

### Categories
```
POST   /api/v1/admin/categories          create category (optional parentId)
GET    /api/v1/admin/categories          list categories (tree)
PATCH  /api/v1/admin/categories/:id       edit
DELETE /api/v1/admin/categories/:id       delete
```

### Products
```
POST   /api/v1/admin/products                    create product
GET    /api/v1/admin/products?categoryId=c2        list, filterable by category (also: status, search)
GET    /api/v1/admin/products/:id                    get one
PATCH  /api/v1/admin/products/:id                     edit
DELETE /api/v1/admin/products/:id                      delete/archive
```
Products filtered by category use a query param (`?categoryId=`), not a nested `/categories/:id/products` route — one consistent way to fetch/filter products, matching the pattern the website's public product listing also uses.

### Variants
```
POST   /api/v1/admin/products/:id/variants     create variant (+ initial stock, via incrementStock) — nested under product for creation
PATCH  /api/v1/admin/variants/:variantId         edit (price, size, color, etc.) — flat for edit/delete
DELETE /api/v1/admin/variants/:variantId          delete
```

### Stock actions
```
PATCH /api/v1/admin/stock/:variantId/restock     increment stock (reason: restock)
PATCH /api/v1/admin/stock/:variantId/adjust        manual correction, +/- (reason: adjustment)
GET   /api/v1/admin/stock/logs                       view inventory_logs audit trail
```

### Orders (website) — includes payment verification
```
GET   /api/v1/admin/orders                        list/filter website orders
GET   /api/v1/admin/orders/:id                       order detail (includes screenshot)
PATCH /api/v1/admin/orders/:id/status                  update status, add tracking ref
GET   /api/v1/admin/orders/pending-payments               filtered: payments.status = pending_verification
PATCH /api/v1/admin/orders/:id/verify-payment                confirm or reject a payment
```

### POS sales log (read-only)
```
GET /api/v1/admin/pos-sales           list POS sales, across staff/shifts
GET /api/v1/admin/pos-sales/:id         one sale's detail
```

### Dashboards
```
GET /api/v1/admin/dashboards/sales?range=today
GET /api/v1/admin/dashboards/sales?range=week
GET /api/v1/admin/dashboards/sales?range=month
GET /api/v1/admin/dashboards/sales?date=2026-08-10
GET /api/v1/admin/dashboards/sales?from=2026-08-01&to=2026-08-10

GET /api/v1/admin/dashboards/low-stock?threshold=10
```
Sales response breaks out web vs. POS separately, not just a combined total:
```json
{
  "range": "today",
  "totalSales": 15400,
  "webSales": 9200,
  "posSales": 6200,
  "orderCount": 12,
  "saleCount": 8
}
```

---

## 3. Folder Structure

Flat, one level deep, same as `web/` and `pos/`. Every module follows the standard 4-layer pattern (`routes → controller → service → repository`) — no exceptions, no nesting.

```
admin/
├── admin.routes.ts               # combining router — mounts all 8 modules, applies requireRole(["admin"]) once
│
├── staffs/
│   ├── staff.routes.ts
│   ├── staff.controller.ts
│   ├── staff.service.ts
│   └── staff.repository.ts
│
├── categories/
│   ├── category.routes.ts
│   ├── category.controller.ts
│   ├── category.service.ts
│   └── category.repository.ts
│
├── products/
│   ├── product.routes.ts
│   ├── product.controller.ts
│   ├── product.service.ts
│   └── product.repository.ts
│
├── variants/
│   ├── variant.routes.ts
│   ├── variant.controller.ts
│   ├── variant.service.ts
│   └── variant.repository.ts
│
├── stock/
│   ├── stock.routes.ts
│   ├── stock.controller.ts
│   ├── stock.service.ts          # calls shared/inventory's incrementStock()
│   └── stock.repository.ts
│
├── orders/
│   ├── orders-admin.routes.ts
│   ├── orders-admin.controller.ts
│   ├── orders-admin.service.ts   # manual payment verification lives here
│   └── orders-admin.repository.ts
│
├── pos-sales/
│   ├── pos-sales-log.routes.ts
│   ├── pos-sales-log.controller.ts
│   ├── pos-sales-log.service.ts
│   └── pos-sales-log.repository.ts
│
└── dashboards/
    ├── dashboard.routes.ts
    ├── dashboard.controller.ts
    ├── dashboard.service.ts      # pulls from both web orders + pos sales
    └── dashboard.repository.ts
```

---

## 4. Wiring — how the routers mount

```ts
// admin/admin.routes.ts
import { Router } from "express";
import { staffRouter } from "./staffs/staff.routes";
import { categoryRouter } from "./categories/category.routes";
import { productRouter } from "./products/product.routes";
import { variantRouter } from "./variants/variant.routes";
import { stockRouter } from "./stock/stock.routes";
import { ordersAdminRouter } from "./orders/orders-admin.routes";
import { posSalesLogRouter } from "./pos-sales/pos-sales-log.routes";
import { dashboardRouter } from "./dashboards/dashboard.routes";
import { requireRole } from "../shared/auth/auth.middleware";

export const adminRouter = Router();
adminRouter.use(requireRole(["admin"]));   // protects everything under /admin, in one place

adminRouter.use("/staffs", staffRouter);
adminRouter.use("/categories", categoryRouter);
adminRouter.use("/products", productRouter);
adminRouter.use("/variants", variantRouter);
adminRouter.use("/stock", stockRouter);
adminRouter.use("/orders", ordersAdminRouter);
adminRouter.use("/pos-sales", posSalesLogRouter);
adminRouter.use("/dashboards", dashboardRouter);
```

```ts
// app.ts
import { adminRouter } from "./admin/admin.routes";

app.use("/api/v1/admin", adminRouter);
```

`app.ts` only ever mounts `/api/v1/admin` once. Everything else — `/staffs`, `/products`, `/variants/:id`, `/stock/:variantId/restock`, etc. — is composed by each module's own router knowing only its own slice of the path. Express concatenates the prefixes automatically as a request flows down through the nested `.use()` calls. One flat layer, no intermediate combining router needed beyond `admin.routes.ts` itself.
