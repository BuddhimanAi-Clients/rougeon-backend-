import { randomUUID } from 'node:crypto';
import { Prisma, type PosPaymentMethod } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { AppError } from '../../shared/errors/app-error.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import {
  createSaleWithItems,
  getById,
  getByStaffId,
  getVariantsForSale,
} from './sales.repository.js';

export type CreateSaleInput = {
  items: {
    variantId: string;
    qty: number;
  }[];
  paymentMethod: PosPaymentMethod;
};

function validateSaleItems(items: CreateSaleInput['items']): void {
  if (items.length === 0) {
    throw new AppError(422, 'EMPTY_POS_SALE', 'Sale must contain an item');
  }

  const variantIds = new Set<string>();

  for (const item of items) {
    if (!Number.isSafeInteger(item.qty) || item.qty <= 0) {
      throw new AppError(
        422,
        'INVALID_POS_SALE_QUANTITY',
        'Sale quantities must be positive safe integers',
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

export async function listSalesForStaff(staffId: string) {
  return getByStaffId(staffId);
}

export async function getSaleDetail(saleId: string, staffId: string) {
  const sale = await getById(saleId, staffId);

  if (!sale) {
    throw new AppError(404, 'POS_SALE_NOT_FOUND', 'Sale not found');
  }

  return sale;
}

export async function createSale(
  staffId: string,
  input: CreateSaleInput,
) {
  validateSaleItems(input.items);

  const saleNumber = generateSaleNumber();

  const sale = await prisma.$transaction(async (transaction) => {
    const variantIds = input.items.map((item) => item.variantId);

    const variants = await getVariantsForSale(transaction, variantIds);

    if (variants.length !== variantIds.length) {
      throw new AppError(
        404,
        'POS_SALE_VARIANT_NOT_FOUND',
        'One or more sale variants were not found',
      );
    }

    const priceByVariantId = new Map(
      variants.map((variant) => [variant.id, variant.price]),
    );

    const saleItems = input.items.map((item) => {
      const price = priceByVariantId.get(item.variantId);

      if (!price) {
        throw new AppError(
          404,
          'POS_SALE_VARIANT_NOT_FOUND',
          'One or more sale variants were not found',
        );
      }

      return {
        variantId: item.variantId,
        qty: item.qty,
        price,
      };
    });

    const subtotal = saleItems.reduce(
      (sum, item) => sum.plus(item.price.mul(item.qty)),
      new Prisma.Decimal(0),
    );

    const createdSale = await createSaleWithItems(transaction, {
      staffId,
      saleNumber,
      paymentMethod: input.paymentMethod,
      subtotal,
      total: subtotal,
      items: saleItems,
    });

    // Keep lock order consistent across concurrent sales.
    const inventoryItems = [...saleItems].sort((left, right) =>
      left.variantId.localeCompare(right.variantId),
    );

    for (const item of inventoryItems) {
      await changeInventory({
        transaction,
        variantId: item.variantId,
        changeQty: -item.qty,
        reason: 'pos_sale',
        source: 'pos',
        referenceId: createdSale.id,
      });
    }

    return createdSale;
  });

  return {
    ...sale,
    subtotal: sale.subtotal.toString(),
    total: sale.total.toString(),
    items: sale.items.map((item) => ({
      ...item,
      price: item.price.toString(),
    })),
  };
}