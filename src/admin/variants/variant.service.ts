import { InventoryReason, InventorySource } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import type { CreateVariantBody, UpdateVariantBody } from './variant.schemas.js';
import * as variantRepository from './variant.repository.js';

export async function createVariant(productId: string, input: CreateVariantBody) {
  if (!(await variantRepository.findProduct(productId))) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  }
  return variantRepository.runVariantTransaction(async (transaction) => {
    const variant = await variantRepository.createVariant(transaction, productId, input);
    if (input.initialStock > 0) {
      await changeInventory({
        transaction,
        variantId: variant.id,
        changeQty: input.initialStock,
        reason: InventoryReason.initial_stock,
        source: InventorySource.admin,
        referenceId: variant.id,
      });
    }
    return variantRepository.findVariantInTransaction(transaction, variant.id);
  });
}

export async function updateVariant(id: string, input: UpdateVariantBody) {
  if (!(await variantRepository.findVariant(id))) {
    throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant was not found');
  }
  return variantRepository.updateVariant(id, input);
}

export async function deleteVariant(id: string) {
  const usage = await variantRepository.variantUsage(id);
  if (!usage) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant was not found');
  const referenced = Object.values(usage._count).some((count) => count > 0);
  if (usage.stockQty !== 0 || referenced) {
    throw new AppError(
      409,
      'VARIANT_IN_USE',
      'A stocked or referenced variant cannot be deleted with the current schema',
    );
  }
  await variantRepository.deleteVariant(id);
}
