import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import type { CreateVariantBody, UpdateVariantBody } from './variant.schemas.js';

export function findProduct(id: string) {
  return prisma.product.findUnique({ where: { id }, select: { id: true } });
}

export function runVariantTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(operation);
}

export function createVariant(
  transaction: Prisma.TransactionClient,
  productId: string,
  input: CreateVariantBody,
) {
  return transaction.productVariant.create({
    data: {
      productId,
      sku: input.sku,
      size: input.size,
      color: input.color,
      price: new Prisma.Decimal(input.price),
      stockQty: 0,
    },
  });
}

export function findVariantInTransaction(
  transaction: Prisma.TransactionClient,
  id: string,
) {
  return transaction.productVariant.findUniqueOrThrow({ where: { id } });
}

export function findVariant(id: string) {
  return prisma.productVariant.findUnique({ where: { id }, include: { product: true } });
}

export function updateVariant(id: string, input: UpdateVariantBody) {
  const data: Prisma.ProductVariantUncheckedUpdateInput = {};
  if (input.sku !== undefined) data.sku = input.sku;
  if (input.size !== undefined) data.size = input.size;
  if (input.color !== undefined) data.color = input.color;
  if (input.price !== undefined) data.price = new Prisma.Decimal(input.price);
  return prisma.productVariant.update({ where: { id }, data, include: { product: true } });
}

export async function variantUsage(id: string) {
  const variant = await prisma.productVariant.findUnique({
    where: { id },
    select: {
      stockQty: true,
      _count: {
        select: {
          inventoryLogs: true,
          cartItems: true,
          wishlistItems: true,
          orderItems: true,
          posSaleItems: true,
        },
      },
    },
  });
  return variant;
}

export function deleteVariant(id: string) {
  return prisma.productVariant.delete({ where: { id } });
}
