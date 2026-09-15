import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { paginationArgs } from '../../shared/http/pagination.js';
import type { ListPosSalesQuery } from './pos-sales-log.schemas.js';
import { localDayBounds } from '../../shared/calendar/calendar.service.js';

function saleWhere(query: ListPosSalesQuery): Prisma.PosSaleWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  const parts = (value: string) => { const [year, month, day] = value.split('-').map(Number); return { year: year!, month: month!, day: day! }; };
  if (query.from) createdAt.gte = localDayBounds(parts(query.from)).start;
  if (query.to) createdAt.lt = localDayBounds(parts(query.to)).end;
  return {
    ...(query.staffId ? { staffId: query.staffId } : {}),
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    ...(query.needsReview !== undefined
      ? { needsReview: query.needsReview }
      : {}),
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

export function resolveReview(id: string) {
  return prisma.posSale.updateMany({
    where: { id, needsReview: true },
    data: { needsReview: false },
  });
}
