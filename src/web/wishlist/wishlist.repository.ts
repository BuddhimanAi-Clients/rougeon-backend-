import { ProductStatus } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';

const wishlistInclude = {
  variant: {
    include: {
      product: {
        select: { id: true, name: true, slug: true, images: true, status: true },
      },
    },
  },
} as const;

export function findSellableVariant(variantId: string) {
  return prisma.productVariant.findFirst({
    where: { id: variantId, product: { status: ProductStatus.active } },
    select: { id: true },
  });
}

export function listWishlist(userId: string) {
  return prisma.wishlistItem.findMany({
    where: { userId },
    include: wishlistInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

export function addWishlistItem(userId: string, variantId: string) {
  return prisma.wishlistItem.upsert({
    where: { userId_variantId: { userId, variantId } },
    create: { userId, variantId },
    update: {},
    include: wishlistInclude,
  });
}

export function removeWishlistItem(userId: string, variantId: string) {
  return prisma.wishlistItem.deleteMany({ where: { userId, variantId } });
}
