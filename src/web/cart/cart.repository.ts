import { Prisma, type ProductVariant } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import type { CartOwner } from './cart.schemas.js';

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

const cartInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

function ownerWhere(owner: CartOwner): Prisma.CartWhereUniqueInput {
  return 'userId' in owner
    ? { userId: owner.userId }
    : { sessionId: owner.sessionId };
}

function ownerData(owner: CartOwner): Prisma.CartUncheckedCreateInput {
  return 'userId' in owner
    ? { userId: owner.userId }
    : { sessionId: owner.sessionId };
}

export function findCart(owner: CartOwner, client: DatabaseClient = prisma) {
  return client.cart.findUnique({
    where: ownerWhere(owner),
    include: cartInclude,
  });
}

export function getOrCreateCart(
  transaction: Prisma.TransactionClient,
  owner: CartOwner,
) {
  return transaction.cart.upsert({
    where: ownerWhere(owner),
    create: ownerData(owner),
    update: {},
  });
}

export function lockCart(transaction: Prisma.TransactionClient, cartId: string) {
  return transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "carts" WHERE "id" = ${cartId} FOR UPDATE
  `);
}

export function findVariant(
  client: DatabaseClient,
  variantId: string,
): Promise<
  | (ProductVariant & {
      product: { id: string; name: string; slug: string; status: string };
    })
  | null
> {
  return client.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
}

export function findCartItem(
  transaction: Prisma.TransactionClient,
  cartId: string,
  itemId: string,
) {
  return transaction.cartItem.findFirst({ where: { id: itemId, cartId } });
}

export function findCartVariantItem(
  transaction: Prisma.TransactionClient,
  cartId: string,
  variantId: string,
) {
  return transaction.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId } },
  });
}

export function createCartItem(
  transaction: Prisma.TransactionClient,
  cartId: string,
  variantId: string,
  qty: number,
) {
  return transaction.cartItem.create({ data: { cartId, variantId, qty } });
}

export function updateCartItemQuantity(
  transaction: Prisma.TransactionClient,
  itemId: string,
  qty: number,
) {
  return transaction.cartItem.update({ where: { id: itemId }, data: { qty } });
}

export function deleteCartItem(
  transaction: Prisma.TransactionClient,
  itemId: string,
) {
  return transaction.cartItem.delete({ where: { id: itemId } });
}

export function clearCartItems(
  transaction: Prisma.TransactionClient,
  cartId: string,
) {
  return transaction.cartItem.deleteMany({ where: { cartId } });
}

export function deleteCart(transaction: Prisma.TransactionClient, cartId: string) {
  return transaction.cart.delete({ where: { id: cartId } });
}

export function runCartTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
