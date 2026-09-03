import { randomUUID } from 'node:crypto';
import { Prisma, type PosPaymentMethod } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { AppError } from '../../shared/errors/app-error.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import {
  MAX_POS_ITEM_QUANTITY,
  MAX_POS_SALE_ITEMS,
} from './sales.constants.js';
import {
  createSaleWithItems,
  getByClientSaleId,
  getByClientSaleIdInTransaction,
  getById,
  getByStaffId,
  getStaffForSale,
  getVariantsForSale,
  lockOfflineSaleKey,
  lockSaleVariants,
  markSaleNeedsReview,
} from './sales.repository.js';
import type { ListSalesQuery } from './sales.schemas.js';

export type CreateSaleInput = {
  items: {
    variantId: string;
    qty: number;
  }[];
  paymentMethod: PosPaymentMethod;
};

export type CreateOfflineSaleInput = CreateSaleInput & {
  clientSaleId: string;
  occurredAt: Date;
};

type StoredSale = NonNullable<Awaited<ReturnType<typeof getByClientSaleId>>>;

type SaleCreationResult = {
  sale: StoredSale;
  replayed: boolean;
};

function validateSaleItems(items: CreateSaleInput['items']): void {
  if (items.length === 0 || items.length > MAX_POS_SALE_ITEMS) {
    throw new AppError(
      422,
      'INVALID_POS_SALE_SIZE',
      `A sale must contain between 1 and ${MAX_POS_SALE_ITEMS} items`,
    );
  }

  const variantIds = new Set<string>();

  for (const item of items) {
    if (
      !Number.isSafeInteger(item.qty) ||
      item.qty <= 0 ||
      item.qty > MAX_POS_ITEM_QUANTITY
    ) {
      throw new AppError(
        422,
        'INVALID_POS_SALE_QUANTITY',
        `Sale quantities must be integers between 1 and ${MAX_POS_ITEM_QUANTITY}`,
      );
    }

    if (variantIds.has(item.variantId)) {
      throw new AppError(
        422,
        'DUPLICATE_POS_SALE_VARIANT',
        'A variant may appear only once in a sale',
      );
    }

    variantIds.add(item.variantId);
  }
}

function generateSaleNumber(): string {
  return `SALE-${randomUUID().toUpperCase()}`;
}

function serializeSale(sale: StoredSale) {
  return {
    ...sale,
    subtotal: sale.subtotal.toFixed(2),
    total: sale.total.toFixed(2),
    items: sale.items.map((item) => ({
      ...item,
      price: item.price.toFixed(2),
    })),
  };
}

function assertIdempotentReplayMatches(
  existing: StoredSale,
  input: CreateOfflineSaleInput,
): void {
  const quantitiesByVariantId = new Map(
    existing.items.map((item) => [item.variantId, item.qty]),
  );
  const matches =
    existing.paymentMethod === input.paymentMethod &&
    existing.createdAt.getTime() === input.occurredAt.getTime() &&
    existing.items.length === input.items.length &&
    input.items.every(
      (item) => quantitiesByVariantId.get(item.variantId) === item.qty,
    );

  if (!matches) {
    throw new AppError(
      409,
      'POS_OFFLINE_IDEMPOTENCY_CONFLICT',
      'clientSaleId was already used for a different offline sale',
    );
  }
}

export async function listSalesForStaff(
  staffId: string,
  query: ListSalesQuery,
) {
  const [sales, total] = await getByStaffId(staffId, query);
  return paginatedResult(
    sales.map((sale) => ({
      ...sale,
      subtotal: sale.subtotal.toFixed(2),
      total: sale.total.toFixed(2),
    })),
    total,
    query,
  );
}

export async function getSaleDetail(saleId: string, staffId: string) {
  const sale = await getById(saleId, staffId);

  if (!sale) {
    throw new AppError(404, 'POS_SALE_NOT_FOUND', 'Sale not found');
  }

  return serializeSale(sale);
}

async function createSaleWithInventoryPolicy(
  staffId: string,
  input: CreateSaleInput | CreateOfflineSaleInput,
  allowNegativeStock: boolean,
): Promise<SaleCreationResult> {
  validateSaleItems(input.items);

  const offlineInput = 'clientSaleId' in input ? input : undefined;
  const clientSaleId = offlineInput?.clientSaleId;
  if (offlineInput) {
    const existing = await getByClientSaleId(staffId, offlineInput.clientSaleId);
    if (existing) {
      assertIdempotentReplayMatches(existing, offlineInput);
      return { sale: existing, replayed: true };
    }
  }

  const saleNumber = generateSaleNumber();

  try {
    return await prisma.$transaction(async (transaction) => {
      if (offlineInput) {
        await lockOfflineSaleKey(
          transaction,
          staffId,
          offlineInput.clientSaleId,
        );
        const existing = await getByClientSaleIdInTransaction(
          transaction,
          staffId,
          offlineInput.clientSaleId,
        );
        if (existing) {
          assertIdempotentReplayMatches(existing, offlineInput);
          return { sale: existing, replayed: true };
        }
      }

      const staff = await getStaffForSale(transaction, staffId);
      if (!staff) {
        throw new AppError(
          403,
          'POS_STAFF_NOT_ALLOWED',
          'The authenticated account cannot create POS sales',
        );
      }

      const variantIds = input.items.map((item) => item.variantId);
      const lockOrderedVariantIds = [...variantIds].sort((left, right) =>
        left.localeCompare(right),
      );
      await lockSaleVariants(transaction, lockOrderedVariantIds);
      const variants = await getVariantsForSale(transaction, variantIds);

      if (variants.length !== variantIds.length) {
        throw new AppError(
          404,
          'POS_SALE_VARIANT_NOT_FOUND',
          'One or more active sale variants were not found',
        );
      }

      const variantById = new Map(
        variants.map((variant) => [variant.id, variant]),
      );

      const saleItems = input.items.map((item) => {
        const variant = variantById.get(item.variantId);

        if (!variant) {
          throw new AppError(
            404,
            'POS_SALE_VARIANT_NOT_FOUND',
            'One or more active sale variants were not found',
          );
        }

        return {
          variantId: item.variantId,
          productName: variant.product.name,
          variantSku: variant.sku,
          variantSize: variant.size,
          variantColor: variant.color,
          qty: item.qty,
          price: variant.price,
        };
      });

      const subtotal = saleItems.reduce(
        (sum, item) => sum.plus(item.price.mul(item.qty)),
        new Prisma.Decimal(0),
      );

      const createdSale = await createSaleWithItems(transaction, {
        staffId,
        ...(clientSaleId ? { clientSaleId } : {}),
        cashierName: staff.name,
        ...(offlineInput ? { occurredAt: offlineInput.occurredAt } : {}),
        saleNumber,
        paymentMethod: input.paymentMethod,
        subtotal,
        total: subtotal,
        items: saleItems,
      });

      const inventoryItems = [...saleItems].sort((left, right) =>
        left.variantId.localeCompare(right.variantId),
      );

      let needsReview = false;

      for (const item of inventoryItems) {
        const inventoryResult = await changeInventory({
          transaction,
          variantId: item.variantId,
          changeQty: -item.qty,
          reason: 'pos_sale',
          source: 'pos',
          referenceId: createdSale.id,
          allowNegative: allowNegativeStock,
        });

        if (inventoryResult.stockQty < 0) needsReview = true;
      }

      if (needsReview) {
        await markSaleNeedsReview(transaction, createdSale.id);
      }

      return {
        sale: { ...createdSale, needsReview },
        replayed: false,
      };
    });
  } catch (error) {
    if (
      clientSaleId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await getByClientSaleId(staffId, clientSaleId);
      if (existing && offlineInput) {
        assertIdempotentReplayMatches(existing, offlineInput);
        return { sale: existing, replayed: true };
      }
    }

    throw error;
  }
}

export async function createSale(staffId: string, input: CreateSaleInput) {
  const result = await createSaleWithInventoryPolicy(staffId, input, false);
  return serializeSale(result.sale);
}

export async function createOfflineSale(
  staffId: string,
  input: CreateOfflineSaleInput,
) {
  const result = await createSaleWithInventoryPolicy(staffId, input, true);

  return {
    sale: serializeSale(result.sale),
    needsReview: result.sale.needsReview,
    replayed: result.replayed,
  };
}
