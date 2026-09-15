import {
  Prisma,
  ProductStatus,
  UserRole,
  type PosPaymentMethod,
} from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { paginationArgs } from '../../shared/http/pagination.js';
import type { ListSalesQuery } from './sales.schemas.js';

const saleItemSelect = {
  id: true,
  variantId: true,
  productName: true,
  productImageUrl: true,
  variantSku: true,
  variantSize: true,
  variantColor: true,
  qty: true,
  price: true,
} satisfies Prisma.PosSaleItemSelect;

const storedSaleSelect = {
  id: true,
  saleNumber: true,
  staffId: true,
  customerProfileId: true,
  clientSaleId: true,
  cashierName: true,
  subtotal: true,
  merchandiseDiscount: true,
  membershipDiscountPercent: true,
  membershipTierSnapshot: true,
  total: true,
  paymentMethod: true,
  needsReview: true,
  createdAt: true,
  items: {
    orderBy: { id: 'asc' as const },
    select: saleItemSelect,
  },
} satisfies Prisma.PosSaleSelect;

export type CreateSaleItemInput = {
  variantId: string;
  productName: string;
  productImageUrl: string | null;
  variantSku: string;
  variantSize: string;
  variantColor: string;
  qty: number;
  price: Prisma.Decimal;
};

export type CreateSaleWithItemsInput = {
  staffId: string;
  customerProfileId?: string;
  clientSaleId?: string;
  cashierName: string;
  occurredAt?: Date;
  saleNumber: string;
  paymentMethod: PosPaymentMethod;
  subtotal: Prisma.Decimal;
  merchandiseDiscount: Prisma.Decimal;
  membershipDiscountPercent: Prisma.Decimal;
  membershipTierSnapshot?: Prisma.InputJsonValue;
  total: Prisma.Decimal;
  items: CreateSaleItemInput[];
};

export function getStaffForSale(
  transaction: Prisma.TransactionClient,
  staffId: string,
) {
  return transaction.user.findFirst({
    where: {
      id: staffId,
      isActive: true,
      role: { in: [UserRole.cashier, UserRole.admin] },
    },
    select: { id: true, name: true },
  });
}

export function getVariantsForSale(
  transaction: Prisma.TransactionClient,
  variantIds: string[],
) {
  return transaction.productVariant.findMany({
    where: {
      id: { in: variantIds },
      product: { status: ProductStatus.active },
    },
    select: {
      id: true,
      sku: true,
      size: true,
      color: true,
      price: true,
      product: { select: { name: true, images: true, media: { orderBy: { sortOrder: 'asc' }, take: 1, select: { publicUrl: true } } } },
    },
  });
}

export function lockSaleVariants(
  transaction: Prisma.TransactionClient,
  variantIds: string[],
) {
  return transaction.$queryRaw<{ id: string; stockQty: number }[]>(Prisma.sql`
    SELECT "id", "stockQty"
    FROM "product_variants"
    WHERE "id" IN (${Prisma.join(variantIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export function createSaleWithItems(
  transaction: Prisma.TransactionClient,
  input: CreateSaleWithItemsInput,
) {
  return transaction.posSale.create({
    data: {
      staffId: input.staffId,
      ...(input.customerProfileId ? { customerProfileId: input.customerProfileId } : {}),
      ...(input.clientSaleId ? { clientSaleId: input.clientSaleId } : {}),
      cashierName: input.cashierName,
      ...(input.occurredAt ? { createdAt: input.occurredAt } : {}),
      saleNumber: input.saleNumber,
      paymentMethod: input.paymentMethod,
      subtotal: input.subtotal,
      merchandiseDiscount: input.merchandiseDiscount,
      membershipDiscountPercent: input.membershipDiscountPercent,
      ...(input.membershipTierSnapshot ? { membershipTierSnapshot: input.membershipTierSnapshot } : {}),
      total: input.total,
      items: {
        create: input.items.map((item) => ({
          variantId: item.variantId,
          productName: item.productName,
          productImageUrl: item.productImageUrl,
          variantSku: item.variantSku,
          variantSize: item.variantSize,
          variantColor: item.variantColor,
          qty: item.qty,
          price: item.price,
        })),
      },
    },
    select: storedSaleSelect,
  });
}

export function markSaleNeedsReview(
  transaction: Prisma.TransactionClient,
  saleId: string,
) {
  return transaction.posSale.update({
    where: { id: saleId },
    data: { needsReview: true },
    select: { id: true, needsReview: true },
  });
}

export function getByClientSaleId(staffId: string, clientSaleId: string) {
  return prisma.posSale.findUnique({
    where: { staffId_clientSaleId: { staffId, clientSaleId } },
    select: storedSaleSelect,
  });
}

export function lockOfflineSaleKey(
  transaction: Prisma.TransactionClient,
  staffId: string,
  clientSaleId: string,
) {
  const lockKey = `${staffId}:${clientSaleId}`;
  return transaction.$queryRaw<{ locked: number }[]>(Prisma.sql`
    SELECT 1::integer AS "locked"
    FROM (
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    ) AS "acquired_lock"
  `);
}

export function getByClientSaleIdInTransaction(
  transaction: Prisma.TransactionClient,
  staffId: string,
  clientSaleId: string,
) {
  return transaction.posSale.findUnique({
    where: { staffId_clientSaleId: { staffId, clientSaleId } },
    select: storedSaleSelect,
  });
}

export function getByStaffId(staffId: string, query: ListSalesQuery) {
  const where = { staffId };
  return prisma.$transaction([
    prisma.posSale.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        saleNumber: true,
        subtotal: true,
        total: true,
        paymentMethod: true,
        needsReview: true,
        createdAt: true,
      },
      ...paginationArgs(query),
    }),
    prisma.posSale.count({ where }),
  ]);
}

export function getById(id: string, staffId: string) {
  return prisma.posSale.findFirst({
    where: { id, staffId },
    select: storedSaleSelect,
  });
}
