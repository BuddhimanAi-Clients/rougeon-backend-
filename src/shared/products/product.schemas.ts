import { z } from 'zod';
import { paginationQueryFields } from '../http/pagination.js';

const priceQuerySchema = z
  .union([z.string(), z.number().finite()])
  .transform((value) => String(value))
  .pipe(
    z
      .string()
      .regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Price must have at most two decimal places'),
  );

export const publicProductListQuerySchema = z
  .object({
    ...paginationQueryFields,
    categoryId: z.string().trim().min(1).max(128).optional(),
    categorySlug: z
      .string()
      .trim()
      .min(1)
      .max(140)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    search: z.string().trim().min(1).max(180).optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
    minPrice: priceQuerySchema.optional(),
    maxPrice: priceQuerySchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.categoryId && value.categorySlug) {
      context.addIssue({
        code: 'custom',
        message: 'Use either categoryId or categorySlug, not both',
      });
    }
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      Number(value.minPrice) > Number(value.maxPrice)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'minPrice must be less than or equal to maxPrice',
      });
    }
  });

export const publicProductSlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

export type PublicProductListQuery = z.infer<
  typeof publicProductListQuerySchema
>;
export type PublicProductSlugParams = z.infer<
  typeof publicProductSlugParamsSchema
>;
