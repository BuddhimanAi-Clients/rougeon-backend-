import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import type { CartOwner } from '../cart/cart.schemas.js';

function ownerWhere(owner: CartOwner): Prisma.CartWhereUniqueInput {
  return 'userId' in owner
    ? { userId: owner.userId }
    : { sessionId: owner.sessionId };
}

export function runCheckoutTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export function findCart(
  transaction: Prisma.TransactionClient,
  owner: CartOwner,
) {
  return transaction.cart.findUnique({
    where: ownerWhere(owner),
    select: { id: true },
  });
}

export function lockCart(transaction: Prisma.TransactionClient, cartId: string) {
  return transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "carts" WHERE "id" = ${cartId} FOR UPDATE
  `);
}

export function findCartState(
  transaction: Prisma.TransactionClient,
  cartId: string,
) {
  return transaction.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          variant: { include: { product: true } },
        },
        orderBy: [{ variantId: 'asc' }, { id: 'asc' }],
      },
    },
  });
}

export function findAddress(
  transaction: Prisma.TransactionClient,
  userId: string,
  addressId: string,
) {
  return transaction.address.findFirst({
    where: { id: addressId, userId },
  });
}

export function findUser(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, isActive: true, role: true },
  });
}

export function createOrder(
  transaction: Prisma.TransactionClient,
  data: Prisma.OrderUncheckedCreateInput,
) {
  return transaction.order.create({
    data,
    include: {
      items: { orderBy: [{ id: 'asc' }] },
      payments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
}

export function clearCart(
  transaction: Prisma.TransactionClient,
  cartId: string,
) {
  return transaction.cartItem.deleteMany({ where: { cartId } });
}

export function findActivePaymentQrConfiguration(transaction: Prisma.TransactionClient) {
  return transaction.paymentQrConfiguration.findFirst({ where: { isActive: true }, orderBy: { activatedAt: 'desc' } });
}
