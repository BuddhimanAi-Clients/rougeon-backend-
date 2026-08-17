import { PaymentStatus, Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';

type WebAggregate = { total: Prisma.Decimal; count: bigint };
type PosAggregate = { total: Prisma.Decimal; count: bigint };

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
