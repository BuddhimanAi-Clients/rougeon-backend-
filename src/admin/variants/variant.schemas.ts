import { z } from 'zod';

const moneySchema = z
  .union([z.string(), z.number().finite()])
  .transform((value) => String(value))
  .pipe(z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Price must have at most two decimal places'))
  .refine((value) => Number(value) > 0, 'Price must be greater than zero');

export const productVariantParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
export const variantIdParamsSchema = z.object({ variantId: z.string().trim().min(1).max(128) });
export const createVariantBodySchema = z.object({
  sku: z.string().trim().min(1).max(100),
  size: z.string().trim().min(1).max(80),
  color: z.string().trim().min(1).max(80),
  price: moneySchema,
  initialStock: z.number().int().min(0).max(2_147_483_647).default(0),
});
export const updateVariantBodySchema = z
  .object({
    sku: z.string().trim().min(1).max(100).optional(),
    size: z.string().trim().min(1).max(80).optional(),
    color: z.string().trim().min(1).max(80).optional(),
    price: moneySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });

export type ProductVariantParams = z.infer<typeof productVariantParamsSchema>;
export type VariantIdParams = z.infer<typeof variantIdParamsSchema>;
export type CreateVariantBody = z.infer<typeof createVariantBodySchema>;
export type UpdateVariantBody = z.infer<typeof updateVariantBodySchema>;
