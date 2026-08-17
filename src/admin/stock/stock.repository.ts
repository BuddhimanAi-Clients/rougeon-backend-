import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { paginationArgs } from '../../shared/http/pagination.js';
import type { StockLogsQuery } from './stock.schemas.js';

export function runStockTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(operation);
}

export async function listInventoryLogs(query: StockLogsQuery) {
  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) createdAt.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) {
    const exclusiveEnd = new Date(`${query.to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    createdAt.lt = exclusiveEnd;
  }
  const where: Prisma.InventoryLogWhereInput = {
    ...(query.variantId ? { variantId: query.variantId } : {}),
    ...(query.reason ? { reason: query.reason } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };
  return prisma.$transaction([
    prisma.inventoryLog.findMany({
      where,
      include: { variant: { include: { product: { select: { id: true, name: true, slug: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    }),
    prisma.inventoryLog.count({ where }),
  ]);
}
