import { z } from 'zod';

export const addWishlistItemBodySchema = z.object({
  variantId: z.string().trim().min(1).max(128),
});

export const wishlistVariantParamsSchema = z.object({
  variantId: z.string().trim().min(1).max(128),
});

export type AddWishlistItemBody = z.infer<typeof addWishlistItemBodySchema>;
export type WishlistVariantParams = z.infer<typeof wishlistVariantParamsSchema>;
