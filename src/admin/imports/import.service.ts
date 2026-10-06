import { InventoryReason, InventorySource, Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { logger } from '../../configs/logger.config.js';
import { AppError } from '../../shared/errors/app-error.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import { nameKey } from '../../shared/catalog/catalog-text.js';
import { planImport, type ExistingCatalog, type ImportPlan, type ImportRowInput } from './import-plan.js';
import type { CompleteImportBody, ImportBody } from './import.schemas.js';

async function loadCatalog(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<ExistingCatalog> {
  const [categories, products, variants] = await Promise.all([
    client.category.findMany({ select: { id: true, name: true, slug: true } }),
    client.product.findMany({
      select: {
        id: true, name: true, slug: true,
        variants: { select: { id: true, sku: true, size: true, color: true } },
        media: { select: { color: true, sourceName: true } },
      },
    }),
    client.productVariant.findMany({ select: { sku: true, color: true } }),
  ]);
  return {
    categories,
    products,
    skus: variants.map((variant) => variant.sku),
    colours: [...new Set(variants.map((variant) => variant.color))],
  };
}

function toRows(body: ImportBody): ImportRowInput[] {
  return body.rows as ImportRowInput[];
}

/** Reads the file and reports what an import would do. Saves nothing. */
export async function checkImport(body: ImportBody): Promise<ImportPlan> {
  return planImport(toRows(body), body.photos, await loadCatalog(), body.confirmedNew);
}

/**
 * Creates the categories, products and variants in one transaction, so a
 * failure leaves the catalogue untouched. Photos are uploaded afterwards per
 * product by the Admin app, which can safely be repeated.
 */
export async function applyImport(actorId: string, body: ImportBody) {
  const result = await prisma.$transaction(async (transaction) => {
    // Planned again inside the transaction: this is what is actually saved.
    const plan = planImport(toRows(body), body.photos, await loadCatalog(transaction), body.confirmedNew);
    if (plan.errors.length > 0 || plan.suggestions.length > 0) {
      throw new AppError(422, 'IMPORT_NOT_READY', 'Fix the problems in the check report before importing');
    }

    const categoryIdByKey = new Map<string, string>();
    for (const category of plan.categories) {
      if (category.existingId) categoryIdByKey.set(nameKey(category.name), category.existingId);
    }
    // Parents first, so a child can point at a category created in this run.
    const pending = plan.categories.filter((category) => !category.existingId);
    const ordered = [...pending.filter((category) => !category.parentName), ...pending.filter((category) => category.parentName)];
    for (const category of ordered) {
      const parentId = category.parentName ? categoryIdByKey.get(nameKey(category.parentName)) : undefined;
      const created = await transaction.category.create({ data: { name: category.name, slug: category.slug, ...(parentId ? { parentId } : {}) } });
      categoryIdByKey.set(nameKey(category.name), created.id);
    }

    const products: Array<{ id: string; name: string; created: boolean; photos: ImportPlan['products'][number]['photos'] }> = [];
    for (const product of plan.products) {
      let productId = product.existingId;
      if (!productId) {
        const categoryId = categoryIdByKey.get(nameKey(product.categoryName));
        if (!categoryId) throw new Error(`Category missing for ${product.name}`);
        const created = await transaction.product.create({
          data: {
            categoryId,
            name: product.name,
            slug: product.slug,
            description: product.description,
            images: [],
            status: product.status,
            membershipDiscountEligible: product.membershipDiscountEligible,
          },
        });
        productId = created.id;
      }
      for (const variant of product.variants) {
        if (variant.existingId) {
          // Stock on an existing variant is never overwritten: real sales
          // have changed it since. Only the price follows the file.
          await transaction.productVariant.update({ where: { id: variant.existingId }, data: { price: new Prisma.Decimal(variant.price) } });
          continue;
        }
        const created = await transaction.productVariant.create({
          data: { productId, sku: variant.sku, size: variant.size, color: variant.colour, price: new Prisma.Decimal(variant.price), stockQty: 0 },
        });
        if (variant.stock > 0) {
          await changeInventory({
            transaction,
            variantId: created.id,
            changeQty: variant.stock,
            reason: InventoryReason.initial_stock,
            source: InventorySource.admin,
            referenceId: created.id,
          });
        }
      }
      products.push({ id: productId, name: product.name, created: !product.existingId, photos: product.photos });
    }

    const run = await transaction.productImport.create({
      data: { actorId, summary: { ...plan.summary, warnings: plan.warnings.length, photosResult: null } as Prisma.InputJsonObject },
    });
    return { importId: run.id, summary: plan.summary, warnings: plan.warnings, products };
  }, { timeout: 180_000, maxWait: 20_000 });

  logger.info('Bulk product import applied', { importId: result.importId, actorId, ...result.summary });
  return result;
}

/** Records how the photo uploads went once the Admin app has finished them. */
export async function completeImport(id: string, body: CompleteImportBody) {
  const run = await prisma.productImport.findUnique({ where: { id } });
  if (!run) throw new AppError(404, 'IMPORT_NOT_FOUND', 'Import was not found');
  const summary = run.summary && typeof run.summary === 'object' && !Array.isArray(run.summary) ? run.summary : {};
  return prisma.productImport.update({
    where: { id },
    data: { completedAt: new Date(), summary: { ...summary, photosResult: body.photos } as Prisma.InputJsonObject },
  });
}

export function listImports() {
  return prisma.productImport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { actor: { select: { id: true, name: true, email: true } } },
  });
}
