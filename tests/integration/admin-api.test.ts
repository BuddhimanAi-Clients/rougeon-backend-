import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  UserRole,
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

async function createAuthenticatedUser(role: UserRole) {
  sequence += 1;
  const email = `admin-api-${role}-${sequence}@example.com`;
  const signup = await api('/api/v1/auth/sign-up/email', {
    method: 'POST',
    body: { name: `${role} Test`, email, password: 'StrongPassword123!' },
  });
  assert.equal(signup.status, 200);
  assert.ok(signup.cookie);
  await prisma.user.update({ where: { email }, data: { role } });
  return { id: signup.body.user.id as string, email, cookie: signup.cookie };
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
      if (!address || typeof address === 'string') throw new Error('Test server has no TCP address');
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await truncateTestData();
  await prisma.$disconnect();
});

test('complete Admin API contract', async (context) => {
  const customer = await createAuthenticatedUser(UserRole.customer);
  const cashier = await createAuthenticatedUser(UserRole.cashier);
  const admin = await createAuthenticatedUser(UserRole.admin);

  await context.test('authorization boundary', async () => {
    assert.equal((await api('/api/v1/admin/categories')).status, 401);
    assert.equal((await api('/api/v1/admin/categories', { cookie: customer.cookie })).status, 403);
    assert.equal((await api('/api/v1/admin/categories', { cookie: cashier.cookie })).status, 403);
    assert.equal((await api('/api/v1/admin/categories', { cookie: admin.cookie })).status, 200);
  });

  let staffId = '';
  await context.test('staff management', async () => {
    const created = await api('/api/v1/admin/staffs', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        name: 'Created Cashier',
        email: 'created-cashier@example.com',
        password: 'StrongPassword123!',
        role: 'cashier',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.isActive, true);
    staffId = created.body.data.id;
    assert.equal((await api('/api/v1/admin/staffs', { cookie: admin.cookie })).status, 200);
    assert.equal((await api(`/api/v1/admin/staffs/${staffId}`, { cookie: admin.cookie })).status, 200);
    assert.equal(
      (
        await api(`/api/v1/admin/staffs/${staffId}`, {
          method: 'PATCH',
          cookie: admin.cookie,
          body: { name: 'Updated Cashier' },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api('/api/v1/admin/staffs', {
          method: 'POST',
          cookie: admin.cookie,
          body: {
            name: 'Duplicate',
            email: 'created-cashier@example.com',
            password: 'StrongPassword123!',
            role: 'cashier',
          },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await api('/api/v1/admin/staffs', {
          method: 'POST',
          cookie: admin.cookie,
          body: { name: 'Bad Role', email: 'bad-role@example.com', password: 'StrongPassword123!', role: 'customer' },
        })
      ).status,
      400,
    );
    assert.equal((await api(`/api/v1/admin/staffs/${admin.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 409);
    assert.equal((await api(`/api/v1/admin/staffs/${staffId}`, { method: 'DELETE', cookie: admin.cookie })).status, 200);
    const inactiveLogin = await api('/api/v1/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'created-cashier@example.com', password: 'StrongPassword123!' },
    });
    assert.equal(inactiveLogin.status, 403);
    const reactivated = await api(`/api/v1/admin/staffs/${staffId}/reactivate`, {
      method: 'PATCH',
      cookie: admin.cookie,
    });
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.data.isActive, true);
    const activeLogin = await api('/api/v1/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'created-cashier@example.com', password: 'StrongPassword123!' },
    });
    assert.equal(activeLogin.status, 200);
    assert.equal((await api('/api/v1/admin/staffs/missing', { cookie: admin.cookie })).status, 404);
  });

  let rootCategoryId = '';
  let childCategoryId = '';
  await context.test('category hierarchy', async () => {
    const root = await api('/api/v1/admin/categories', {
      method: 'POST', cookie: admin.cookie, body: { name: 'Clothing', slug: 'clothing' },
    });
    assert.equal(root.status, 201);
    rootCategoryId = root.body.data.id;
    const child = await api('/api/v1/admin/categories', {
      method: 'POST', cookie: admin.cookie, body: { name: 'Shirts', slug: 'shirts', parentId: rootCategoryId },
    });
    assert.equal(child.status, 201);
    childCategoryId = child.body.data.id;
    const tree = await api('/api/v1/admin/categories', { cookie: admin.cookie });
    assert.equal(tree.body.data[0].children[0].id, childCategoryId);
    assert.equal(
      (await api(`/api/v1/admin/categories/${rootCategoryId}`, { method: 'PATCH', cookie: admin.cookie, body: { parentId: rootCategoryId } })).status,
      409,
    );
    assert.equal(
      (await api(`/api/v1/admin/categories/${rootCategoryId}`, { method: 'PATCH', cookie: admin.cookie, body: { parentId: childCategoryId } })).status,
      409,
    );
    assert.equal(
      (await api('/api/v1/admin/categories', { method: 'POST', cookie: admin.cookie, body: { name: 'Bad', slug: 'bad', parentId: 'missing' } })).status,
      404,
    );
    assert.equal((await api(`/api/v1/admin/categories/${rootCategoryId}`, { method: 'DELETE', cookie: admin.cookie })).status, 409);
    const empty = await api('/api/v1/admin/categories', { method: 'POST', cookie: admin.cookie, body: { name: 'Empty', slug: 'empty' } });
    assert.equal((await api(`/api/v1/admin/categories/${empty.body.data.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 200);
  });

  let productId = '';
  let variantId = '';
  await context.test('products, variants, and stock', async () => {
    const product = await api('/api/v1/admin/products', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        categoryId: childCategoryId,
        name: 'Classic Shirt',
        slug: 'classic-shirt',
        description: 'Classic shirt description',
        images: ['https://example.com/shirt.jpg'],
        status: 'active',
      },
    });
    assert.equal(product.status, 201);
    productId = product.body.data.id;
    assert.equal((await api('/api/v1/admin/products?status=active&search=Classic', { cookie: admin.cookie })).body.pagination.total, 1);
    assert.equal((await api(`/api/v1/admin/products/${productId}`, { cookie: admin.cookie })).status, 200);
    assert.equal((await api(`/api/v1/admin/products/${productId}`, { method: 'PATCH', cookie: admin.cookie, body: { name: 'Updated Shirt' } })).status, 200);

    const variant = await api(`/api/v1/admin/products/${productId}/variants`, {
      method: 'POST', cookie: admin.cookie, body: { sku: 'SHIRT-M-BLK', size: 'M', color: 'Black', price: '1299.50', initialStock: 5 },
    });
    assert.equal(variant.status, 201);
    variantId = variant.body.data.id;
    assert.equal(variant.body.data.stockQty, 5);
    assert.equal(
      (await api(`/api/v1/admin/products/${productId}/variants`, { method: 'POST', cookie: admin.cookie, body: { sku: 'SHIRT-M-BLK', size: 'L', color: 'Black', price: '1299.50' } })).status,
      409,
    );
    assert.equal(
      (await api(`/api/v1/admin/products/${productId}/variants`, { method: 'POST', cookie: admin.cookie, body: { sku: 'BAD-PRICE', size: 'L', color: 'Black', price: '1.999' } })).status,
      400,
    );
    assert.equal((await api(`/api/v1/admin/variants/${variantId}`, { method: 'PATCH', cookie: admin.cookie, body: { color: 'Charcoal' } })).status, 200);
    assert.equal((await api(`/api/v1/admin/stock/${variantId}/restock`, { method: 'PATCH', cookie: admin.cookie, body: { quantity: 3 } })).body.data.stockQty, 8);
    assert.equal((await api(`/api/v1/admin/stock/${variantId}/adjust`, { method: 'PATCH', cookie: admin.cookie, body: { adjustment: -2 } })).body.data.stockQty, 6);
    assert.equal((await api(`/api/v1/admin/stock/${variantId}/adjust`, { method: 'PATCH', cookie: admin.cookie, body: { adjustment: -100 } })).status, 409);
    assert.equal((await api('/api/v1/admin/stock/logs?reason=restock', { cookie: admin.cookie })).body.pagination.total, 1);
    assert.equal((await api('/api/v1/admin/stock/missing/restock', { method: 'PATCH', cookie: admin.cookie, body: { quantity: 1 } })).status, 404);
    assert.equal((await api(`/api/v1/admin/variants/${variantId}`, { method: 'DELETE', cookie: admin.cookie })).status, 409);

    const disposable = await api(`/api/v1/admin/products/${productId}/variants`, {
      method: 'POST', cookie: admin.cookie, body: { sku: 'DISPOSABLE', size: 'S', color: 'White', price: '10.00', initialStock: 0 },
    });
    assert.equal((await api(`/api/v1/admin/variants/${disposable.body.data.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 200);
  });

  async function seedOrder(suffix: string) {
    return prisma.order.create({
      data: {
        orderNumber: `WEB-${suffix}`,
        status: OrderStatus.pending,
        subtotal: new Prisma.Decimal('100.00'),
        shippingFee: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('100.00'),
        paymentMethod: 'qr',
        paymentStatus: OrderPaymentStatus.unpaid,
        guestName: 'Guest',
        guestPhone: '9800000000',
        guestFullAddress: 'Test address',
        guestCity: 'Kathmandu',
        items: {
          create: {
            variantId,
            productName: 'Updated Shirt',
            productImageUrl: 'https://example.com/shirt.jpg',
            variantSku: 'SHIRT-M-BLK',
            variantSize: 'M',
            variantColor: 'Charcoal',
            qty: 1,
            price: new Prisma.Decimal('100.00'),
          },
        },
        payments: { create: { method: 'qr', status: PaymentStatus.pending_verification, amount: new Prisma.Decimal('100.00') } },
      },
    });
  }

  await context.test('orders and payment verification', async () => {
    const confirmedOrder = await seedOrder('CONFIRM');
    assert.equal((await api('/api/v1/admin/orders', { cookie: admin.cookie })).status, 200);
    assert.equal((await api('/api/v1/admin/orders/pending-payments', { cookie: admin.cookie })).body.pagination.total, 1);
    assert.equal((await api(`/api/v1/admin/orders/${confirmedOrder.id}`, { cookie: admin.cookie })).status, 200);
    assert.equal(
      (await api(`/api/v1/admin/orders/${confirmedOrder.id}/status`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'shipped' } })).status,
      409,
    );
    assert.equal(
      (await api(`/api/v1/admin/orders/${confirmedOrder.id}/verify-payment`, { method: 'PATCH', cookie: admin.cookie, body: { action: 'confirm' } })).status,
      200,
    );
    assert.equal(
      (await api(`/api/v1/admin/orders/${confirmedOrder.id}/verify-payment`, { method: 'PATCH', cookie: admin.cookie, body: { action: 'confirm' } })).status,
      409,
    );

    const rejectedOrder = await seedOrder('REJECT');
    assert.equal(
      (await api(`/api/v1/admin/orders/${rejectedOrder.id}/verify-payment`, { method: 'PATCH', cookie: admin.cookie, body: { action: 'reject' } })).body.data.paymentStatus,
      'failed',
    );

    const concurrentOrder = await seedOrder('CONCURRENT');
    const results = await Promise.all([
      api(`/api/v1/admin/orders/${concurrentOrder.id}/verify-payment`, { method: 'PATCH', cookie: admin.cookie, body: { action: 'confirm' } }),
      api(`/api/v1/admin/orders/${concurrentOrder.id}/verify-payment`, { method: 'PATCH', cookie: admin.cookie, body: { action: 'confirm' } }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  });

  await context.test('read-only POS sales and dashboards', async () => {
    const sale = await prisma.posSale.create({
      data: {
        saleNumber: 'POS-TEST-1',
        staffId: cashier.id,
        subtotal: new Prisma.Decimal('50.00'),
        total: new Prisma.Decimal('50.00'),
        paymentMethod: 'cash',
        items: { create: { variantId, qty: 1, price: new Prisma.Decimal('50.00') } },
      },
    });
    assert.equal((await api('/api/v1/admin/pos-sales?saleNumber=POS-TEST', { cookie: admin.cookie })).body.pagination.total, 1);
    assert.equal((await api(`/api/v1/admin/pos-sales/${sale.id}`, { cookie: admin.cookie })).status, 200);
    assert.equal((await api('/api/v1/admin/pos-sales', { method: 'POST', cookie: admin.cookie, body: {} })).status, 404);

    const dashboard = await api('/api/v1/admin/dashboards/sales?range=today', { cookie: admin.cookie });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.posSales, 50);
    assert.equal(dashboard.body.totalSales, dashboard.body.webSales + dashboard.body.posSales);
    assert.equal((await api('/api/v1/admin/dashboards/sales?range=today&date=2026-08-17', { cookie: admin.cookie })).status, 400);
    assert.equal((await api('/api/v1/admin/dashboards/low-stock?threshold=10', { cookie: admin.cookie })).status, 200);
  });

  await context.test('product deletion archives the record', async () => {
    const archived = await api(`/api/v1/admin/products/${productId}`, { method: 'DELETE', cookie: admin.cookie });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.status, ProductStatus.archived);
  });
});
