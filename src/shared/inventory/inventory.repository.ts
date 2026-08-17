import { Prisma, type InventoryReason, type InventorySource } from '@prisma/client';
import type { InventoryTransaction } from './inventory.types.js';

type LockedVariant = {
  id: string;
  stockQty: number;
};

export async function lockVariant(
  transaction: InventoryTransaction,
  variantId: string,
) {
  const rows = await transaction.$queryRaw<LockedVariant[]>(Prisma.sql`
    SELECT "id", "stockQty"
    FROM "product_variants"
    WHERE "id" = ${variantId}
    FOR UPDATE
  `);

  return rows[0] ?? null;
}

export function updateVariantStock(
  transaction: InventoryTransaction,
  variantId: string,
  stockQty: number,
) {
  return transaction.productVariant.update({
    where: { id: variantId },
    data: { stockQty },
    select: { id: true, stockQty: true },
  });
}

export function createInventoryLog(
  transaction: InventoryTransaction,
  input: {
    variantId: string;
    changeQty: number;
    reason: InventoryReason;
    source: InventorySource;
    referenceId: string;
  },
) {
  return transaction.inventoryLog.create({ data: input });
}
