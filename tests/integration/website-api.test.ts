import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { Prisma, ProductStatus } from '@prisma/client';
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

async function createCustomer(label: string) {
  sequence += 1;
  const email = `website-${label}-${sequence}@example.com`;
  const signup = await api('/api/v1/auth/sign-up/email', {
    method: 'POST',
    body: { name: `${label} Customer`, email, password: 'StrongPassword123!' },
  });
  assert.equal(signup.status, 200);
  assert.ok(signup.cookie);
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

test('complete implemented Website API contract', async (context) => {
  const category = await prisma.category.create({
    data: { name: 'Clothing', slug: 'clothing' },
  });
  const activeProduct = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: 'Classic Tee',
      slug: 'classic-tee',
      description: 'A classic shirt',
      images: ['https://example.com/classic.jpg'],
      status: ProductStatus.active,
      variants: {
        create: [
          { sku: 'TEE-BLK-M', size: 'M', color: 'Black', price: '100.00', stockQty: 20 },
          { sku: 'TEE-BLK-L', size: 'L', color: 'Black', price: '200.00', stockQty: 5 },
        ],
      },
    },
    include: { variants: { orderBy: { price: 'asc' } } },
  });
  const cheaperProduct = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: 'Budget Tee',
      slug: 'budget-tee',
      description: 'A budget shirt',
      images: [],
      status: ProductStatus.active,
      variants: {
        create: { sku: 'BUDGET-S', size: 'S', color: 'White', price: '50.00', stockQty: 8 },
      },
    },
  });
  for (const status of [ProductStatus.draft, ProductStatus.archived]) {
    await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `${status} Product`,
        slug: `${status}-product`,
        description: 'Hidden product',
        images: [],
        status,
        variants: {
          create: { sku: `${status}-sku`, size: 'M', color: 'Gray', price: '1.00', stockQty: 10 },
        },
      },
    });
  }
  const primaryVariant = activeProduct.variants[0]!;
  const secondaryVariant = activeProduct.variants[1]!;

  await context.test('public categories and Product catalog', async () => {
    const categories = await api('/api/v1/categories');
    assert.equal(categories.status, 200);
    assert.equal(categories.body.data[0].slug, 'clothing');

    const products = await api('/api/v1/products?sort=price_asc&page=1&limit=10');
    assert.equal(products.status, 200);
    assert.equal(products.body.pagination.total, 2);
    assert.equal(products.body.data[0].id, cheaperProduct.id);
    assert.equal(products.body.data[1].id, activeProduct.id);
    assert.equal(products.body.data[1].variants[0].available, true);

    const search = await api('/api/v1/products?search=TEE-BLK-L');
    assert.equal(search.body.pagination.total, 1);
    assert.equal(search.body.data[0].slug, 'classic-tee');
    const filtered = await api('/api/v1/products?minPrice=90&maxPrice=150');
    assert.equal(filtered.body.pagination.total, 1);
    const detail = await api('/api/v1/products/classic-tee');
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.minPrice, '100.00');
    assert.equal((await api('/api/v1/products/draft-product')).status, 404);
  });

  const guestStart = await api('/api/v1/cart');
  assert.equal(guestStart.status, 200);
  assert.ok(guestStart.cookie?.startsWith('guest_session_id='));
  const guestCookie = guestStart.cookie!;

  await context.test('guest Cart creation, CRUD, ownership, and cookie reuse', async () => {
    const added = await api('/api/v1/cart/items', {
      method: 'POST',
      cookie: guestCookie,
      body: { variantId: primaryVariant.id, qty: 1 },
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.data.items[0].qty, 1);
    const duplicate = await api('/api/v1/cart/items', {
      method: 'POST',
      cookie: guestCookie,
      body: { variantId: primaryVariant.id, qty: 1 },
    });
    assert.equal(duplicate.body.data.items[0].qty, 2);
    const itemId = duplicate.body.data.items[0].id;
    const updated = await api(`/api/v1/cart/items/${itemId}`, {
      method: 'PATCH',
      cookie: guestCookie,
      body: { qty: 3 },
    });
    assert.equal(updated.body.data.subtotal, '300.00');
    const temporary = await api('/api/v1/cart/items', {
      method: 'POST',
      cookie: guestCookie,
      body: { variantId: secondaryVariant.id, qty: 1 },
    });
    const temporaryItem = temporary.body.data.items.find(
      (item: any) => item.variant.id === secondaryVariant.id,
    );
    assert.equal(
      (
        await api(`/api/v1/cart/items/${temporaryItem.id}`, {
          method: 'DELETE',
          cookie: guestCookie,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api('/api/v1/cart/items/not-owned', {
          method: 'PATCH',
          body: { qty: 1 },
        })
      ).status,
      404,
    );
    assert.equal((await api('/api/v1/cart', { cookie: guestCookie })).body.data.items[0].qty, 3);
    assert.equal(
      (await api('/api/v1/cart', { method: 'DELETE', cookie: guestCookie })).status,
      200,
    );
    assert.equal((await api('/api/v1/cart', { cookie: guestCookie })).body.data.items.length, 0);
    await api('/api/v1/cart/items', {
      method: 'POST',
      cookie: guestCookie,
      body: { variantId: primaryVariant.id, qty: 3 },
    });
  });

  const customer = await createCustomer('Primary');
  const otherCustomer = await createCustomer('Other');

  await context.test('authenticated Cart isolation and idempotent guest merge', async () => {
    const customerCart = await api('/api/v1/cart/items', {
      method: 'POST',
      cookie: customer.cookie,
      body: { variantId: primaryVariant.id, qty: 1 },
    });
    assert.equal(customerCart.body.data.items[0].qty, 1);
    const merged = await api('/api/v1/cart/merge', {
      method: 'POST',
      cookie: `${customer.cookie}; ${guestCookie}`,
    });
    assert.equal(merged.status, 200);
    assert.equal(merged.body.data.items[0].qty, 4);
    const repeated = await api('/api/v1/cart/merge', {
      method: 'POST',
      cookie: `${customer.cookie}; ${guestCookie}`,
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.data.items[0].qty, 4);
    assert.equal((await api('/api/v1/cart', { cookie: otherCustomer.cookie })).body.data.items.length, 0);
  });

  await context.test('Wishlist authentication and uniqueness', async () => {
    assert.equal((await api('/api/v1/wishlist')).status, 401);
    assert.equal(
      (
        await api('/api/v1/wishlist', {
          cookie: 'better-auth.session_token=invalid-session',
        })
      ).status,
      401,
    );
    for (let index = 0; index < 2; index += 1) {
      assert.equal(
        (
          await api('/api/v1/wishlist/items', {
            method: 'POST',
            cookie: customer.cookie,
            body: { variantId: primaryVariant.id },
          })
        ).status,
        201,
      );
    }
    const wishlist = await api('/api/v1/wishlist', { cookie: customer.cookie });
    assert.equal(wishlist.body.data.length, 1);
    assert.equal(
      (
        await api(`/api/v1/wishlist/items/${primaryVariant.id}`, {
          method: 'DELETE',
          cookie: customer.cookie,
        })
      ).status,
      200,
    );
  });

  let addressId = '';
  await context.test('Address ownership and default transitions', async () => {
    assert.equal((await api('/api/v1/addresses')).status, 401);
    const first = await api('/api/v1/addresses', {
      method: 'POST',
      cookie: customer.cookie,
      body: {
        label: 'Home',
        fullAddress: 'Itahari main road',
        city: 'Itahari',
        phone: '9800000000',
      },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.isDefault, true);
    addressId = first.body.data.id;
    const second = await api('/api/v1/addresses', {
      method: 'POST',
      cookie: customer.cookie,
      body: {
        label: 'Office',
        fullAddress: 'Dharan office road',
        city: 'Dharan',
        phone: '9811111111',
        isDefault: true,
      },
    });
    assert.equal(second.body.data.isDefault, true);
    const addresses = await api('/api/v1/addresses', { cookie: customer.cookie });
    assert.equal(addresses.body.data.filter((address: any) => address.isDefault).length, 1);
    assert.equal(
      (
        await api(`/api/v1/addresses/${second.body.data.id}`, {
          method: 'PATCH',
          cookie: otherCustomer.cookie,
          body: { label: 'Stolen' },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await api(`/api/v1/addresses/${addressId}/default`, {
          method: 'PATCH',
          cookie: customer.cookie,
        })
      ).status,
      200,
    );
    await api('/api/v1/cart/items', {
      method: 'POST',
      cookie: otherCustomer.cookie,
      body: { variantId: primaryVariant.id, qty: 1 },
    });
    assert.equal(
      (
        await api('/api/v1/checkout', {
          method: 'POST',
          cookie: otherCustomer.cookie,
          body: { shippingAddressId: addressId },
        })
      ).status,
      404,
    );
    await api('/api/v1/cart', { method: 'DELETE', cookie: otherCustomer.cookie });
  });

  let customerOrderId = '';
  await context.test('authenticated checkout uses server totals and immutable snapshots', async () => {
    const stockBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: primaryVariant.id },
      select: { stockQty: true },
    });
    const checkout = await api('/api/v1/checkout', {
      method: 'POST',
      cookie: customer.cookie,
      body: { shippingAddressId: addressId },
    });
    assert.equal(checkout.status, 201);
    assert.equal(checkout.body.data.order.subtotal, '400.00');
    assert.equal(checkout.body.data.order.shippingFee, '150.00');
    assert.equal(checkout.body.data.order.total, '550.00');
    assert.equal(checkout.body.data.payment.status, 'awaiting_proof');
    assert.equal(checkout.body.data.paymentInstructions.amount, '550.00');
    customerOrderId = checkout.body.data.order.id;

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: customerOrderId },
      include: { items: true, payments: true },
    });
    assert.equal(stored.userId, customer.id);
    assert.equal(stored.guestSessionId, null);
    assert.equal(stored.guestName, 'Primary Customer');
    assert.equal(stored.guestCity, 'Itahari');
    assert.equal(stored.items[0]!.productName, 'Classic Tee');
    assert.equal(stored.items[0]!.variantSku, 'TEE-BLK-M');
    assert.equal(stored.payments[0]!.status, 'awaiting_proof');
    assert.equal(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: primaryVariant.id } })).stockQty,
      stockBefore.stockQty,
    );
    assert.equal((await api('/api/v1/checkout', { method: 'POST', cookie: customer.cookie, body: { shippingAddressId: addressId } })).status, 422);
  });

  await context.test('customer Order reads enforce ownership and reload QR instructions', async () => {
    const history = await api('/api/v1/orders', { cookie: customer.cookie });
    assert.equal(history.status, 200);
    assert.equal(history.body.pagination.total, 1);
    await api(`/api/v1/addresses/${addressId}`, {
      method: 'PATCH',
      cookie: customer.cookie,
      body: { city: 'Changed City' },
    });
    await prisma.product.update({
      where: { id: activeProduct.id },
      data: { name: 'Changed Product Name' },
    });
    await prisma.productVariant.update({
      where: { id: primaryVariant.id },
      data: { color: 'Changed Color' },
    });
    const detail = await api(`/api/v1/orders/${customerOrderId}`, {
      cookie: customer.cookie,
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.delivery.city, 'Itahari');
    assert.equal(detail.body.data.items[0].productName, 'Classic Tee');
    assert.equal(detail.body.data.items[0].variantColor, 'Black');
    assert.equal((await api(`/api/v1/orders/${customerOrderId}`, { cookie: otherCustomer.cookie })).status, 404);
    const instructions = await api(`/api/v1/orders/${customerOrderId}/payment-instructions`, {
      cookie: customer.cookie,
    });
    assert.equal(instructions.status, 200);
    assert.equal(instructions.body.data.amount, '550.00');
    await prisma.product.update({
      where: { id: activeProduct.id },
      data: { name: 'Classic Tee' },
    });
    await prisma.productVariant.update({
      where: { id: primaryVariant.id },
      data: { color: 'Black' },
    });
  });

  let guestOrderId = '';
  await context.test('guest checkout and Order reads require the matching cookie hash', async () => {
    const guest = await api('/api/v1/cart');
    const cookie = guest.cookie!;
    await api('/api/v1/cart/items', {
      method: 'POST',
      cookie,
      body: { variantId: secondaryVariant.id, qty: 1 },
    });
    const checkout = await api('/api/v1/checkout', {
      method: 'POST',
      cookie,
      body: {
        guest: {
          name: 'Guest Buyer',
          phone: '9822222222',
          fullAddress: 'Guest delivery road',
          city: 'Itahari',
        },
      },
    });
    assert.equal(checkout.status, 201);
    guestOrderId = checkout.body.data.order.id;
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: guestOrderId } });
    assert.equal(stored.userId, null);
    assert.equal(stored.guestSessionId?.length, 64);
    assert.equal((await api(`/api/v1/orders/${guestOrderId}`, { cookie })).status, 200);
    assert.equal((await api(`/api/v1/orders/${guestOrderId}`)).status, 404);
    assert.equal((await api('/api/v1/orders', { cookie })).status, 401);
  });

  await context.test('checkout revalidates current stock and price', async () => {
    const guest = await api('/api/v1/cart');
    const cookie = guest.cookie!;
    await api('/api/v1/cart/items', {
      method: 'POST',
      cookie,
      body: { variantId: primaryVariant.id, qty: 1 },
    });
    await prisma.productVariant.update({
      where: { id: primaryVariant.id },
      data: { price: new Prisma.Decimal('125.00'), stockQty: 0 },
    });
    const body = {
      guest: {
        name: 'Stock Guest',
        phone: '9833333333',
        fullAddress: 'Stock test road',
        city: 'Itahari',
      },
    };
    assert.equal((await api('/api/v1/checkout', { method: 'POST', cookie, body })).status, 409);
    await prisma.productVariant.update({
      where: { id: primaryVariant.id },
      data: { stockQty: 20 },
    });
    const checkout = await api('/api/v1/checkout', { method: 'POST', cookie, body });
    assert.equal(checkout.status, 201);
    assert.equal(checkout.body.data.order.subtotal, '125.00');
    assert.equal(checkout.body.data.order.total, '275.00');
  });

  await context.test('concurrent checkout consumes one Cart only once', async () => {
    const guest = await api('/api/v1/cart');
    const cookie = guest.cookie!;
    await api('/api/v1/cart/items', {
      method: 'POST',
      cookie,
      body: { variantId: secondaryVariant.id, qty: 1 },
    });
    const body = {
      guest: {
        name: 'Concurrent Guest',
        phone: '9844444444',
        fullAddress: 'Concurrent road',
        city: 'Itahari',
      },
    };
    const results = await Promise.all([
      api('/api/v1/checkout', { method: 'POST', cookie, body }),
      api('/api/v1/checkout', { method: 'POST', cookie, body }),
    ]);
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    assert.equal(results.filter((result) => [409, 422].includes(result.status)).length, 1);
  });
});
