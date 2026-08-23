import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { syncSalesBodySchema } from '../../src/pos/offline-sync/sync.schemas.js';
import {
  createSaleBodySchema,
  listSalesQuerySchema,
} from '../../src/pos/sales/sales.schemas.js';

const validItem = { variantId: 'variant-1', qty: 1 };
const validQueuedSale = {
  clientSaleId: '10000000-0000-4000-8000-000000000001',
  occurredAt: '2026-08-23T10:00:00.000Z',
  items: [validItem],
  paymentMethod: 'cash',
};

describe('POS request schemas', () => {
  test('live sales reject duplicate variants and unsafe quantities', () => {
    assert.equal(
      createSaleBodySchema.safeParse({
        items: [validItem, validItem],
        paymentMethod: 'cash',
      }).success,
      false,
    );
    for (const qty of [0, -1, 1.5, 10_001, 2_147_483_648]) {
      assert.equal(
        createSaleBodySchema.safeParse({
          items: [{ variantId: 'variant-1', qty }],
          paymentMethod: 'cash',
        }).success,
        false,
      );
    }
  });

  test('sale item count and history pagination are bounded', () => {
    const items = Array.from({ length: 101 }, (_, index) => ({
      variantId: `variant-${index}`,
      qty: 1,
    }));
    assert.equal(
      createSaleBodySchema.safeParse({ items, paymentMethod: 'qr' }).success,
      false,
    );
    assert.equal(listSalesQuerySchema.safeParse({ limit: 101 }).success, false);
    assert.deepEqual(listSalesQuerySchema.parse({}), { page: 1, limit: 20 });
  });

  test('offline sync requires stable identity and occurrence time', () => {
    assert.equal(
      syncSalesBodySchema.safeParse({ sales: [validQueuedSale] }).success,
      true,
    );
    assert.equal(
      syncSalesBodySchema.safeParse({
        sales: [{ ...validQueuedSale, clientSaleId: 'not-a-uuid' }],
      }).success,
      false,
    );
    assert.equal(
      syncSalesBodySchema.safeParse({
        sales: [validQueuedSale, validQueuedSale],
      }).success,
      false,
    );
    assert.equal(
      syncSalesBodySchema.safeParse({
        sales: [{ ...validQueuedSale, occurredAt: 'not-a-date' }],
      }).success,
      false,
    );
  });
});
