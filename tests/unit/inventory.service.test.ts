import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { InventoryReason, InventorySource } from '@prisma/client';
import { AppError } from '../../src/shared/errors/app-error.js';
import { changeInventory } from '../../src/shared/inventory/inventory.service.js';
import type { InventoryTransaction } from '../../src/shared/inventory/inventory.types.js';

function fakeTransaction(stockQty: number) {
  const calls: Array<{ type: string; value: unknown }> = [];
  const transaction = {
    $queryRaw: async () => [{ id: 'variant-1', stockQty }],
    productVariant: {
      update: async ({ data }: { data: { stockQty: number } }) => {
        calls.push({ type: 'stock', value: data.stockQty });
        return { id: 'variant-1', stockQty: data.stockQty };
      },
    },
    inventoryLog: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ type: 'log', value: data });
        return { id: 'log-1' };
      },
    },
  } as unknown as InventoryTransaction;
  return { transaction, calls };
}

describe('changeInventory', () => {
  test('updates stock and creates its log in the supplied transaction', async () => {
    const { transaction, calls } = fakeTransaction(4);
    const result = await changeInventory({
      transaction,
      variantId: 'variant-1',
      changeQty: 3,
      reason: InventoryReason.restock,
      source: InventorySource.admin,
      referenceId: 'admin-1',
    });

    assert.equal(result.previousStock, 4);
    assert.equal(result.stockQty, 7);
    assert.deepEqual(calls.map((call) => call.type), ['stock', 'log']);
  });

  test('rejects negative stock before an update or log is written', async () => {
    const { transaction, calls } = fakeTransaction(2);
    await assert.rejects(
      changeInventory({
        transaction,
        variantId: 'variant-1',
        changeQty: -3,
        reason: InventoryReason.adjustment,
        source: InventorySource.admin,
        referenceId: 'admin-1',
      }),
      (error) => error instanceof AppError && error.code === 'INSUFFICIENT_STOCK',
    );
    assert.equal(calls.length, 0);
  });

  test('rejects zero and non-integer changes', async () => {
    const { transaction } = fakeTransaction(2);
    for (const changeQty of [0, 1.5]) {
      await assert.rejects(
        changeInventory({
          transaction,
          variantId: 'variant-1',
          changeQty,
          reason: InventoryReason.adjustment,
          source: InventorySource.admin,
          referenceId: 'admin-1',
        }),
        (error) => error instanceof AppError && error.code === 'INVALID_STOCK_CHANGE',
      );
    }
  });
});
