import { PaymentStatus, Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';

type WebAggregate = { total: Prisma.Decimal; count: bigint };
type PosAggregate = { total: Prisma.Decimal; count: bigint };
type ProductAggregate = { productName: string; productImageUrl: string | null; units: bigint; revenue: Prisma.Decimal };

export async function aggregateSales(start: Date, end: Date) {
  const [webRows, posRows] = await Promise.all([
    prisma.$queryRaw<WebAggregate[]>(Prisma.sql`
      SELECT COALESCE(SUM("amount"), 0) AS "total", COUNT(DISTINCT "orderId") AS "count"
      FROM "payments"
      WHERE "status" = ${PaymentStatus.success}::"PaymentStatus"
        AND "paidAt" >= ${start}
        AND "paidAt" < ${end}
    `),
    prisma.$queryRaw<PosAggregate[]>(Prisma.sql`
      SELECT COALESCE(SUM("total"), 0) AS "total", COUNT(*) AS "count"
      FROM "pos_sales"
      WHERE "createdAt" >= ${start}
        AND "createdAt" < ${end}
    `),
  ]);
  return {
    webTotal: webRows[0]?.total ?? new Prisma.Decimal(0),
    webCount: Number(webRows[0]?.count ?? 0n),
    posTotal: posRows[0]?.total ?? new Prisma.Decimal(0),
    posCount: Number(posRows[0]?.count ?? 0n),
  };
}

export async function aggregateProductSales(start: Date, end: Date) {
  const [web, pos] = await Promise.all([
    prisma.$queryRaw<ProductAggregate[]>(Prisma.sql`
      SELECT oi."productName", MAX(oi."productImageUrl") AS "productImageUrl", SUM(oi."qty") AS "units", COALESCE(SUM(oi."price" * oi."qty"), 0) AS "revenue"
      FROM "order_items" oi JOIN "orders" o ON o."id" = oi."orderId" JOIN "payments" p ON p."orderId" = o."id"
      WHERE p."status" = ${PaymentStatus.success}::"PaymentStatus" AND p."paidAt" >= ${start} AND p."paidAt" < ${end}
      GROUP BY oi."productName"`),
    prisma.$queryRaw<ProductAggregate[]>(Prisma.sql`
      SELECT psi."productName", MAX(psi."productImageUrl") AS "productImageUrl", SUM(psi."qty") AS "units", COALESCE(SUM(psi."price" * psi."qty"), 0) AS "revenue"
      FROM "pos_sale_items" psi JOIN "pos_sales" ps ON ps."id" = psi."saleId"
      WHERE ps."createdAt" >= ${start} AND ps."createdAt" < ${end}
      GROUP BY psi."productName"`),
  ]);
  return { web, pos };
}

export function findLowStock(threshold: number) {
  return prisma.productVariant.findMany({
    where: { stockQty: { lte: threshold }, product: { status: ProductStatus.active } },
    include: {
      product: {
        select: { id: true, name: true, slug: true, category: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ stockQty: 'asc' }, { sku: 'asc' }, { id: 'asc' }],
  });
}
