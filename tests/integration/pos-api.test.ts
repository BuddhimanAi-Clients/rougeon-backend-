import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import {
  Prisma,
  ProductStatus,
  UserRole,
  type UserRole as UserRoleType,
} from '@prisma/client';
import { app } from '../../src/app.js';
import { prisma } from '../../src/configs/database.config.js';

let server: Server;
let baseUrl: string;
let sequence = 0;

type ApiResult = { status: number; body: any; cookie?: string };

async function api(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { Origin: 'http://localhost:5173' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  const setCookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  return {
    status: response.status,
    body: text ? JSON.parse(text) : undefined,
    ...(setCookie ? { cookie: setCookie } : {}),
  };
}

async function createAuthenticatedUser(role: UserRoleType, label: string) {
  sequence += 1;
  const email = `pos-api-${label.toLowerCase()}-${sequence}@example.com`;
  const name = `${label} Test`;
  const signup = await api('/api/v1/auth/sign-up/email', {
    method: 'POST',
    body: { name, email, password: 'StrongPassword123!' },
  });
  assert.equal(signup.status, 200);
  await prisma.user.update({ where: { id: signup.body.user.id as string }, data: { role, emailVerified: true } });
  const signIn = await api('/api/v1/auth/sign-in/email', { method: 'POST', body: { email, password: 'StrongPassword123!' } });
  assert.equal(signIn.status, 200);
  assert.ok(signIn.cookie);
  return { id: signup.body.user.id as string, name, cookie: signIn.cookie };
}

async function truncateTestData() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "pos_sale_items", "pos_sales", "payments", "order_items", "orders",
      "wishlist_items", "cart_items", "carts", "inventory_logs",
      "product_variants", "products", "categories", "addresses",
      "sessions", "accounts", "verifications", "users"
    RESTART IDENTITY CASCADE
  `);
}

before(async () => {
  await prisma.$connect();
  await truncateTestData();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Test server has no TCP address');
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await truncateTestData();
  await prisma.$disconnect();
});

test('complete POS API contract', async (context) => {
  const customer = await createAuthenticatedUser(UserRole.customer, 'Customer');
  const cashier = await createAuthenticatedUser(UserRole.cashier, 'Cashier');
  const otherCashier = await createAuthenticatedUser(
    UserRole.cashier,
    'Other-Cashier',
  );
  const admin = await createAuthenticatedUser(UserRole.admin, 'Admin');
  const customerProfile = await prisma.customerProfile.create({
    data: {
      userId: customer.id, fullName: customer.name, normalizedPhone: '9800000000',
      normalizedEmail: 'pos-api-customer-1@example.com', birthDate: new Date('2000-01-01'), preferredCalendar: 'AD',
    },
  });

  const category = await prisma.category.create({
    data: { name: 'POS Clothing', slug: 'pos-clothing' },
  });
  const activeProduct = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: 'Classic Tee',
      slug: 'pos-classic-tee',
      description: 'POS test product',
      images: ['https://example.com/tee.jpg'],
      status: ProductStatus.active,
      variants: {
        create: {
          sku: 'POS-TEE-BLK-M',
          size: 'M',
          color: 'Black',
          price: new Prisma.Decimal('100.00'),
          stockQty: 5,
        },
      },
    },
    include: { variants: true },
  });
  const activeVariant = activeProduct.variants[0]!;
  const archivedProduct = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: 'Archived Tee',
      slug: 'pos-archived-tee',
      description: 'Not sellable',
      images: [],
      status: ProductStatus.archived,
      variants: {
        create: {
          sku: 'POS-ARCHIVED',
          size: 'L',
          color: 'Gray',
          price: new Prisma.Decimal('50.00'),
          stockQty: 5,
        },
      },
    },
    include: { variants: true },
  });

  await context.test('authorization and role-aware Product stock', async () => {
    assert.equal((await api('/api/v1/pos')).status, 401);
    assert.equal(
      (await api('/api/v1/pos', { cookie: customer.cookie })).status,
      403,
    );
    assert.equal(
      (await api('/api/v1/pos', { cookie: cashier.cookie })).status,
      200,
    );
    assert.equal(
      (await api('/api/v1/pos', { cookie: admin.cookie })).status,
      200,
    );

    const publicProducts = await api('/api/v1/products?search=POS-TEE-BLK-M');
    assert.equal(publicProducts.status, 200);
    assert.equal(
      Object.hasOwn(publicProducts.body.data[0].variants[0], 'stockQty'),
      true,
    );
    const cashierProducts = await api(
      '/api/v1/products?search=POS-TEE-BLK-M',
      { cookie: cashier.cookie },
    );
    assert.equal(cashierProducts.body.data[0].variants[0].stockQty, 5);
    const customerProducts = await api(
      '/api/v1/products?search=POS-TEE-BLK-M',
      { cookie: customer.cookie },
    );
    assert.equal(
      Object.hasOwn(customerProducts.body.data[0].variants[0], 'stockQty'),
      true,
    );
  });

  let liveSaleId = '';
  await context.test('live sale uses DB price and atomically decrements stock', async () => {
    const sale = await api('/api/v1/pos/sales', {
      method: 'POST',
      cookie: cashier.cookie,
      body: {
        items: [{ variantId: activeVariant.id, qty: 2 }],
        paymentMethod: 'cash',
        customerProfileId: customerProfile.id,
      },
    });
    assert.equal(sale.status, 201);
    assert.equal(sale.body.data.subtotal, '200.00');
    assert.equal(sale.body.data.cashierName, cashier.name);
    assert.equal(sale.body.data.items[0].productName, 'Classic Tee');
    liveSaleId = sale.body.data.id;

    assert.equal(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: activeVariant.id },
        })
      ).stockQty,
      3,
    );
    const inventoryLog = await prisma.inventoryLog.findFirstOrThrow({
      where: { referenceId: liveSaleId },
    });
    assert.equal(inventoryLog.changeQty, -2);
  });

  await context.test('sale validation and active Product enforcement rollback safely', async () => {
    const archivedSale = await api('/api/v1/pos/sales', {
      method: 'POST',
      cookie: cashier.cookie,
      body: {
        items: [{ variantId: archivedProduct.variants[0]!.id, qty: 1 }],
        paymentMethod: 'cash',
        customerProfileId: customerProfile.id,
      },
    });
    assert.equal(archivedSale.status, 404);

    const saleCountBefore = await prisma.posSale.count();
    const insufficient = await api('/api/v1/pos/sales', {
      method: 'POST',
      cookie: cashier.cookie,
      body: {
        items: [{ variantId: activeVariant.id, qty: 4 }],
        paymentMethod: 'cash',
        customerProfileId: customerProfile.id,
      },
    });
    assert.equal(insufficient.status, 409);
    assert.equal(await prisma.posSale.count(), saleCountBefore);
    assert.equal(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: activeVariant.id },
        })
      ).stockQty,
      3,
    );
  });

  await context.test('sale history is paginated and ownership-scoped', async () => {
    const list = await api('/api/v1/pos/sales?page=1&limit=1', {
      cookie: cashier.cookie,
    });
    assert.equal(list.status, 200);
    assert.equal(list.body.pagination.total, 1);
    assert.equal(list.body.data[0].id, liveSaleId);
    assert.equal(
      (await api(`/api/v1/pos/sales/${liveSaleId}`, { cookie: cashier.cookie }))
        .status,
      200,
    );
    assert.equal(
      (
        await api(`/api/v1/pos/sales/${liveSaleId}`, {
          cookie: otherCashier.cookie,
        })
      ).status,
      404,
    );
  });

  await context.test('receipt uses immutable snapshots and documented shape', async () => {
    await prisma.product.update({
      where: { id: activeProduct.id },
      data: { name: 'Renamed Product' },
    });
    await prisma.productVariant.update({
      where: { id: activeVariant.id },
      data: {
        sku: 'RENAMED-SKU',
        size: 'XL',
        color: 'Red',
        price: new Prisma.Decimal('125.00'),
      },
    });
    await prisma.user.update({
      where: { id: cashier.id },
      data: { name: 'Renamed Cashier' },
    });

    const receipt = await api(`/api/v1/pos/receipts/${liveSaleId}`, {
      cookie: cashier.cookie,
    });
    assert.equal(receipt.status, 200);
    assert.equal(receipt.body.data.cashierName, cashier.name);
    assert.equal(receipt.body.data.items[0].name, 'Classic Tee, Size M, Black');
    assert.equal(receipt.body.data.items[0].sku, 'POS-TEE-BLK-M');
    assert.equal(receipt.body.data.items[0].price, '100.00');
    assert.equal(receipt.body.data.items[0].lineTotal, '200.00');
    assert.deepEqual(receipt.body.data.storeInfo, {
      name: 'ROGUEON',
      address: 'Kathmandu Maitedevi',
    });
    assert.equal(
      (
        await api(`/api/v1/pos/receipts/${liveSaleId}`, {
          cookie: otherCashier.cookie,
        })
      ).status,
      404,
    );
  });

  await context.test('offline sync is idempotent and persists review state', async () => {
    await prisma.productVariant.update({
      where: { id: activeVariant.id },
      data: { stockQty: 1 },
    });
    const requestBody = {
      sales: [
        {
          clientSaleId: '20000000-0000-4000-8000-000000000001',
          occurredAt: '2026-08-20T08:15:00.000Z',
          items: [{ variantId: activeVariant.id, qty: 3 }],
          paymentMethod: 'qr',
        },
      ],
    };
    const first = await api('/api/v1/pos/sync', {
      method: 'POST',
      cookie: cashier.cookie,
      body: requestBody,
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.results[0].status, 'synced');
    assert.equal(first.body.data.results[0].replayed, false);
    assert.equal(first.body.data.results[0].needsReview, true);
    assert.equal(first.body.data.results[0].sale.subtotal, '375.00');
    assert.equal(
      new Date(first.body.data.results[0].sale.createdAt).toISOString(),
      requestBody.sales[0]!.occurredAt,
    );
    const offlineSaleId = first.body.data.results[0].sale.id;

    const repeated = await api('/api/v1/pos/sync', {
      method: 'POST',
      cookie: cashier.cookie,
      body: requestBody,
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.data.results[0].replayed, true);
    assert.equal(repeated.body.data.results[0].sale.id, offlineSaleId);
    const conflictingReplay = await api('/api/v1/pos/sync', {
      method: 'POST',
      cookie: cashier.cookie,
      body: {
        sales: [
          {
            ...requestBody.sales[0],
            items: [{ variantId: activeVariant.id, qty: 2 }],
          },
        ],
      },
    });
    assert.equal(conflictingReplay.status, 200);
    assert.equal(conflictingReplay.body.data.results[0].status, 'failed');
    assert.equal(
      conflictingReplay.body.data.results[0].error.code,
      'POS_OFFLINE_IDEMPOTENCY_CONFLICT',
    );
    assert.equal(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: activeVariant.id },
        })
      ).stockQty,
      -2,
    );
    assert.equal(
      await prisma.posSale.count({
        where: { staffId: cashier.id, clientSaleId: requestBody.sales[0]!.clientSaleId },
      }),
      1,
    );
    assert.equal(
      await prisma.inventoryLog.count({ where: { referenceId: offlineSaleId } }),
      1,
    );
    const stored = await prisma.posSale.findUniqueOrThrow({
      where: { id: offlineSaleId },
    });
    assert.equal(stored.needsReview, true);

    const adminView = await api(`/api/v1/admin/pos-sales/${offlineSaleId}`, {
      cookie: admin.cookie,
    });
    assert.equal(adminView.status, 200);
    assert.equal(adminView.body.data.needsReview, true);
    const reviewQueue = await api(
      '/api/v1/admin/pos-sales?needsReview=true',
      { cookie: admin.cookie },
    );
    assert.equal(reviewQueue.status, 200);
    assert.equal(reviewQueue.body.pagination.total, 1);
    assert.equal(reviewQueue.body.data[0].id, offlineSaleId);
    const resolved = await api(
      `/api/v1/admin/pos-sales/${offlineSaleId}/resolve-review`,
      { method: 'PATCH', cookie: admin.cookie },
    );
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.needsReview, false);
    assert.equal(
      (
        await api(`/api/v1/admin/pos-sales/${offlineSaleId}/resolve-review`, {
          method: 'PATCH',
          cookie: admin.cookie,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await api('/api/v1/admin/pos-sales?needsReview=true', {
          cookie: admin.cookie,
        })
      ).body.pagination.total,
      0,
    );

    const concurrentBody = {
      sales: [
        {
          clientSaleId: '20000000-0000-4000-8000-000000000002',
          occurredAt: '2026-08-20T08:20:00.000Z',
          items: [{ variantId: activeVariant.id, qty: 1 }],
          paymentMethod: 'cash',
        },
      ],
    };
    const concurrentResults = await Promise.all([
      api('/api/v1/pos/sync', {
        method: 'POST',
        cookie: cashier.cookie,
        body: concurrentBody,
      }),
      api('/api/v1/pos/sync', {
        method: 'POST',
        cookie: cashier.cookie,
        body: concurrentBody,
      }),
    ]);
    assert.deepEqual(
      concurrentResults.map((result) => result.status),
      [200, 200],
    );
    const concurrentIds = concurrentResults.map(
      (result) => result.body.data.results[0].sale.id,
    );
    assert.equal(new Set(concurrentIds).size, 1);
    assert.deepEqual(
      concurrentResults
        .map((result) => result.body.data.results[0].replayed)
        .sort(),
      [false, true],
    );
    assert.equal(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: activeVariant.id },
        })
      ).stockQty,
      -3,
    );
    assert.equal(
      await prisma.posSale.count({
        where: {
          staffId: cashier.id,
          clientSaleId: concurrentBody.sales[0]!.clientSaleId,
        },
      }),
      1,
    );
  });
});
