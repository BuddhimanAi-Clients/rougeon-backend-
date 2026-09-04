import { PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import type { CartOwner } from '../cart/cart.schemas.js';

function ownership(owner: CartOwner): Prisma.OrderWhereInput {
  return 'userId' in owner ? { userId: owner.userId } : { userId: null, guestSessionId: owner.sessionId };
}

export function findOwnedOrder(id: string, owner: CartOwner) {
  return prisma.order.findFirst({ where: { id, ...ownership(owner) }, include: { payments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } } });
}

export function runPaymentTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function lockOrder(transaction: Prisma.TransactionClient, id: string) {
  return transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "orders" WHERE "id" = ${id} FOR UPDATE`);
}

export function findOwnedOrderInTransaction(transaction: Prisma.TransactionClient, id: string, owner: CartOwner) {
  return transaction.order.findFirst({ where: { id, ...ownership(owner) }, include: { payments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } } });
}

export function updatePaymentProof(transaction: Prisma.TransactionClient, id: string, data: { screenshotUrl: string | null; screenshotObjectKey: string; screenshotMimeType: string; screenshotSize: number }) {
  return transaction.payment.update({ where: { id }, data: { ...data, status: PaymentStatus.pending_verification } });
}

export function createPaymentProofAttempt(transaction: Prisma.TransactionClient, input: { orderId: string; amount: Prisma.Decimal; qrConfigurationId: string | null; screenshotUrl: string | null; screenshotObjectKey: string; screenshotMimeType: string; screenshotSize: number }) {
  return transaction.payment.create({ data: { method: 'qr', status: PaymentStatus.pending_verification, ...input } });
}
