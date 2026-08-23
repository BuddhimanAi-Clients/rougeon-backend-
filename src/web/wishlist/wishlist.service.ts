import type { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import * as wishlistRepository from './wishlist.repository.js';

type WishlistRecord = Awaited<
  ReturnType<typeof wishlistRepository.addWishlistItem>
>;

function images(value: Prisma.JsonValue) {
  return Array.isArray(value)
    ? value.filter((image): image is string => typeof image === 'string')
    : [];
}

function wishlistItemResponse(item: WishlistRecord) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    variant: {
      id: item.variant.id,
      sku: item.variant.sku,
      size: item.variant.size,
      color: item.variant.color,
      price: item.variant.price.toFixed(2),
      available:
        item.variant.product.status === 'active' && item.variant.stockQty > 0,
    },
    product: {
      id: item.variant.product.id,
      name: item.variant.product.name,
      slug: item.variant.product.slug,
      images: images(item.variant.product.images),
    },
  };
}

export async function getWishlist(userId: string) {
  return (await wishlistRepository.listWishlist(userId)).map(wishlistItemResponse);
}

export async function addItem(userId: string, variantId: string) {
  if (!(await wishlistRepository.findSellableVariant(variantId))) {
    throw new AppError(404, 'VARIANT_NOT_SELLABLE', 'Variant is not available');
  }
  return wishlistItemResponse(
    await wishlistRepository.addWishlistItem(userId, variantId),
  );
}

export async function removeItem(userId: string, variantId: string) {
  const result = await wishlistRepository.removeWishlistItem(userId, variantId);
  if (result.count === 0) {
    throw new AppError(404, 'WISHLIST_ITEM_NOT_FOUND', 'Wishlist item was not found');
  }
}
