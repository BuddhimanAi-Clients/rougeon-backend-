import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { paginationArgs } from '../../shared/http/pagination.js';
import type { CartOwner } from '../cart/cart.schemas.js';
import type { ListCustomerOrdersQuery } from './order.schemas.js';

const orderInclude = Prisma.validator<Prisma.OrderInclude>()({
  items: {
    include: { variant: { select: { stockQty: true } } },
    orderBy: [{ id: 'asc' as const }],
  },
  payments: {
    select: {
      id: true,
      method: true,
      screenshotUrl: true,
      status: true,
      amount: true,
      verifiedAt: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
      qrConfiguration: { select: { publicUrl: true, providerName: true, accountName: true, accountIdentifier: true, instructions: true } },
    },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
  },
  shipment: { include: { events: { orderBy: [{ occurredAt: 'asc' as const }, { receivedAt: 'asc' as const }] } } },
});

export type WebsiteOrderRecord = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export async function listCustomerOrders(
  owner: CartOwner,
  query: ListCustomerOrdersQuery,
) {
  const where: Prisma.OrderWhereInput = {
    ...('userId' in owner ? { userId: owner.userId } : { userId: null, guestSessionId: owner.sessionId }),
    ...(query.status ? { status: query.status } : {}),
  };
  return prisma.$transaction([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    }),
    prisma.order.count({ where }),
  ]);
}

export function findOwnedOrder(
  id: string,
  owner: CartOwner,
): Prisma.PrismaPromise<WebsiteOrderRecord | null> {
  const ownership: Prisma.OrderWhereInput =
    'userId' in owner
      ? { userId: owner.userId }
      : { userId: null, guestSessionId: owner.sessionId };
  return prisma.order.findFirst({
    where: { id, ...ownership },
    include: orderInclude,
  });
}
