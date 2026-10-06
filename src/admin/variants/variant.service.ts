import { InventoryReason, InventorySource } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import type { CreateVariantBody, UpdateVariantBody } from './variant.schemas.js';
import * as variantRepository from './variant.repository.js';
import { buildSku, nameKey, normalizeColour, normalizeSize } from '../../shared/catalog/catalog-text.js';

function assertNotDuplicate(
  siblings: Array<{ id: string; size: string; color: string }>,
  size: string,
  color: string,
  exceptId?: string,
) {
  const clash = siblings.some((variant) => variant.id !== exceptId && nameKey(variant.size) === nameKey(size) && nameKey(variant.color) === nameKey(color));
  if (clash) {
    throw new AppError(409, 'VARIANT_ALREADY_EXISTS', `This product already has a ${color} / ${size} variant`);
  }
}

async function generateSku(productName: string, color: string, size: string) {
  const base = buildSku(productName, color, size);
  if (!(await variantRepository.skuExists(base))) return base;
  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!(await variantRepository.skuExists(candidate))) return candidate;
  }
  throw new AppError(409, 'SKU_UNAVAILABLE', 'Could not create a unique SKU for this variant');
}

export async function createVariant(productId: string, raw: CreateVariantBody) {
  const product = await variantRepository.findProduct(productId);
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  }
  // Sizes and colours are stored in one consistent form whatever was typed.
  const size = normalizeSize(raw.size);
  const color = normalizeColour(raw.color);
  assertNotDuplicate(await variantRepository.listSiblings(productId), size, color);
  const sku = raw.sku ?? await generateSku(product.name, color, size);
  const input = { ...raw, size, color, sku };
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

export async function updateVariant(id: string, raw: UpdateVariantBody) {
  const existing = await variantRepository.findVariant(id);
  if (!existing) {
    throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant was not found');
  }
  const input: UpdateVariantBody = {
    ...raw,
    ...(raw.size !== undefined ? { size: normalizeSize(raw.size) } : {}),
    ...(raw.color !== undefined ? { color: normalizeColour(raw.color) } : {}),
  };
  if (input.size !== undefined || input.color !== undefined) {
    assertNotDuplicate(
      await variantRepository.listSiblings(existing.productId),
      input.size ?? existing.size,
      input.color ?? existing.color,
      id,
    );
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
