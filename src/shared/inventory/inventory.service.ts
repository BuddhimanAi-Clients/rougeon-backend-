import { AppError } from '../errors/app-error.js';
import {
  createInventoryLog,
  lockVariant,
  updateVariantStock,
} from './inventory.repository.js';
import type {
  InventoryChangeInput,
  InventoryChangeResult,
} from './inventory.types.js';

export async function changeInventory(
  input: InventoryChangeInput,
): Promise<InventoryChangeResult> {
  if (!Number.isSafeInteger(input.changeQty) || input.changeQty === 0) {
    throw new AppError(
      400,
      'INVALID_STOCK_CHANGE',
      'Stock change must be a non-zero safe integer',
    );
  }

  const variant = await lockVariant(input.transaction, input.variantId);
  if (!variant) {
    throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant was not found');
  }

  const resultingStock = variant.stockQty + input.changeQty;
  if (!Number.isSafeInteger(resultingStock)) {
    throw new AppError(422, 'INVALID_STOCK_RESULT', 'Resulting stock is invalid');
  }

  if (!input.allowNegative && resultingStock < 0) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', 'Stock cannot become negative');
  }

  await updateVariantStock(input.transaction, input.variantId, resultingStock);
  const log = await createInventoryLog(input.transaction, {
    variantId: input.variantId,
    changeQty: input.changeQty,
    reason: input.reason,
    source: input.source,
    referenceId: input.referenceId,
  });

  return {
    variantId: input.variantId,
    previousStock: variant.stockQty,
    stockQty: resultingStock,
    changeQty: input.changeQty,
    inventoryLogId: log.id,
  };
}
