import { z } from 'zod';

const quantitySchema = z.number().int().min(1).max(999);

export const addCartItemBodySchema = z.object({
  variantId: z.string().trim().min(1).max(128),
  qty: quantitySchema,
});

export const updateCartItemBodySchema = z.object({
  qty: quantitySchema,
});

export const cartItemParamsSchema = z.object({
  itemId: z.string().trim().min(1).max(128),
});

export type AddCartItemBody = z.infer<typeof addCartItemBodySchema>;
export type UpdateCartItemBody = z.infer<typeof updateCartItemBodySchema>;
export type CartItemParams = z.infer<typeof cartItemParamsSchema>;

export type CartOwner = { userId: string } | { sessionId: string };
