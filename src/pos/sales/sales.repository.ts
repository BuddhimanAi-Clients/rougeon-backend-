import type { PosPaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';

export type CreateSaleItemInput = {
  variantId: string;
  qty: number;
  price: Prisma.Decimal;
};

export type CreateSaleWithItemsInput = {
  staffId: string;
  saleNumber: string;
  paymentMethod: PosPaymentMethod;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  items: CreateSaleItemInput[];
};

export async function getVariantsForSale(
  transaction: Prisma.TransactionClient,
  variantIds: string[],
) {
  return transaction.productVariant.findMany({
    where: {
      id: { in: variantIds },
    },
    select: {
      id: true,
      price: true,
    },
  });
}

export async function createSaleWithItems(
  transaction: Prisma.TransactionClient,
  input: CreateSaleWithItemsInput,
) {
  return transaction.posSale.create({
    data: {
      staffId: input.staffId,
      saleNumber: input.saleNumber,
      paymentMethod: input.paymentMethod,
      subtotal: input.subtotal,
      total: input.total,
      items: {
        create: input.items.map((item) => ({
          variantId: item.variantId,
          qty: item.qty,
          price: item.price,
        })),
      },
    },
    select: {
      id: true,
      saleNumber: true,
      staffId: true,
      subtotal: true,
      total: true,
      paymentMethod: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          qty: true,
          price: true,
        },
      },
    },
  });
}

export async function getByStaffId(staffId: string) {
  const sales = await prisma.posSale.findMany({
    where: { staffId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      saleNumber: true,
      subtotal: true,
      total: true,
      paymentMethod: true,
      createdAt: true,
    },
  });

  return sales.map((sale) => ({
    ...sale,
    subtotal: sale.subtotal.toString(),
    total: sale.total.toString(),
  }));
}

export async function getById(id: string, staffId: string) {
  const sale = await prisma.posSale.findFirst({
    where: { id, staffId },
    select: {
      id: true,
      saleNumber: true,
      subtotal: true,
      total: true,
      paymentMethod: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          qty: true,
          price: true,
          variant: {
            select: {
              id: true,
              sku: true,
              size: true,
              color: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sale) {
    return null;
  }

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
