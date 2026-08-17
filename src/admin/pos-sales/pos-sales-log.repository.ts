import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { paginationArgs } from '../../shared/http/pagination.js';
import type { ListPosSalesQuery } from './pos-sales-log.schemas.js';

function saleWhere(query: ListPosSalesQuery): Prisma.PosSaleWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) createdAt.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) {
    const end = new Date(`${query.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    createdAt.lt = end;
  }
  return {
    ...(query.staffId ? { staffId: query.staffId } : {}),
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    ...(query.saleNumber
      ? { saleNumber: { contains: query.saleNumber, mode: 'insensitive' as const } }
      : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };
}

export async function listPosSales(query: ListPosSalesQuery) {
  const where = saleWhere(query);
  return prisma.$transaction([
    prisma.posSale.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    }),
    prisma.posSale.count({ where }),
  ]);
}

export function findPosSale(id: string) {
  return prisma.posSale.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, name: true, email: true, role: true } },
      items: {
        include: {
          variant: { include: { product: { select: { id: true, name: true, slug: true } } } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
}
