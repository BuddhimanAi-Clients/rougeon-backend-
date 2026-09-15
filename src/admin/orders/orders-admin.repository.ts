import {
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { paginationArgs } from '../../shared/http/pagination.js';
import type { ListOrdersQuery } from './orders-admin.schemas.js';
import { localDayBounds } from '../../shared/calendar/calendar.service.js';

const orderDetailInclude = {
  user: { select: { id: true, name: true, email: true, phone: true } },
  shippingAddress: true,
  items: {
    include: {
      variant: {
        include: { product: { select: { id: true, name: true, slug: true } } },
      },
    },
    orderBy: { id: 'asc' as const },
  },
  payments: {
    include: { verifier: { select: { id: true, name: true, email: true } } },
    orderBy: { id: 'desc' as const },
  },
  shipment: { include: { events: { orderBy: [{ occurredAt: 'asc' as const }, { receivedAt: 'asc' as const }] } } },
} satisfies Prisma.OrderInclude;

function dateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  const parts = (value: string) => { const [year, month, day] = value.split('-').map(Number); return { year: year!, month: month!, day: day! }; };
  if (from) filter.gte = localDayBounds(parts(from)).start;
  if (to) filter.lt = localDayBounds(parts(to)).end;
  return filter;
}

function orderWhere(query: ListOrdersQuery): Prisma.OrderWhereInput {
  const createdAt = dateFilter(query.from, query.to);
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: 'insensitive' as const } },
            { guestName: { contains: query.search, mode: 'insensitive' as const } },
            { guestPhone: { contains: query.search, mode: 'insensitive' as const } },
            { user: { is: { name: { contains: query.search, mode: 'insensitive' as const } } } },
            { user: { is: { email: { contains: query.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
}

export async function listOrders(query: ListOrdersQuery) {
  const where = orderWhere(query);
  return prisma.$transaction([
    prisma.order.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        payments: { orderBy: { id: 'desc' }, take: 1 },
        _count: { select: { items: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    }),
    prisma.order.count({ where }),
  ]);
}

export async function listPendingPayments(query: ListOrdersQuery) {
  const where: Prisma.OrderWhereInput = {
    ...orderWhere(query),
    payments: { some: { status: PaymentStatus.pending_verification } },
  };
  return prisma.$transaction([
    prisma.order.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        items: { include: { variant: { include: { product: true } } } },
        payments: { where: { status: PaymentStatus.pending_verification } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...paginationArgs(query),
    }),
    prisma.order.count({ where }),
  ]);
}

export function findOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
}

export function findPaymentProof(orderId: string, paymentId: string) {
  return prisma.payment.findFirst({
    where: { id: paymentId, orderId, screenshotObjectKey: { not: null } },
    select: { screenshotObjectKey: true, screenshotMimeType: true },
  });
}

export function runOrderTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(operation);
}

export function lockOrder(transaction: Prisma.TransactionClient, orderId: string) {
  return transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE
  `);
}

export function findOrderState(transaction: Prisma.TransactionClient, orderId: string) {
  return transaction.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: [{ variantId: 'asc' }, { id: 'asc' }] },
      payments: { where: { status: PaymentStatus.pending_verification } },
    },
  });
}

export function findOrderForRefund(transaction: Prisma.TransactionClient, orderId: string) {
  return transaction.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: [{ variantId: 'asc' }, { id: 'asc' }] },
      shipment: { include: { events: true } },
    },
  });
}

export function lockPayment(transaction: Prisma.TransactionClient, paymentId: string) {
  return transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE
  `);
}

export function findPayment(transaction: Prisma.TransactionClient, paymentId: string) {
  return transaction.payment.findUnique({ where: { id: paymentId } });
}

export function updatePayment(
  transaction: Prisma.TransactionClient,
  paymentId: string,
  data: Prisma.PaymentUncheckedUpdateInput,
) {
  return transaction.payment.update({ where: { id: paymentId }, data });
}

export function updateOrderInTransaction(
  transaction: Prisma.TransactionClient,
  orderId: string,
  data: Prisma.OrderUncheckedUpdateInput,
) {
  return transaction.order.update({ where: { id: orderId }, data });
}

export function findOrderDetailInTransaction(
  transaction: Prisma.TransactionClient,
  orderId: string,
) {
  return transaction.order.findUniqueOrThrow({
    where: { id: orderId },
    include: orderDetailInclude,
  });
}
