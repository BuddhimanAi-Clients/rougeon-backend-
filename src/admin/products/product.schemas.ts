import { ProductStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQueryFields } from '../../shared/http/pagination.js';

const productFields = {
  categoryId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(20_000),
  images: z.array(z.url()).max(20).default([]),
  status: z.enum(ProductStatus),
  // When false, membership tier discounts never apply to this product.
  membershipDiscountEligible: z.boolean().default(true),
};

export const productIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
// Left out, the slug is generated from the name.
export const createProductBodySchema = z.object({ ...productFields, slug: productFields.slug.optional() });
export const updateProductBodySchema = z
  .object({
    categoryId: productFields.categoryId.optional(),
    name: productFields.name.optional(),
    slug: productFields.slug.optional(),
    description: productFields.description.optional(),
    // No default here: an update that does not mention images must leave the
    // product's photos exactly as they are.
    images: z.array(z.url()).max(20).optional(),
    status: productFields.status.optional(),
    membershipDiscountEligible: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });
export const listProductsQuerySchema = z.object({
  ...paginationQueryFields,
  categoryId: productFields.categoryId.optional(),
  status: productFields.status.optional(),
  search: z.string().trim().min(1).max(180).optional(),
});

export type ProductIdParams = z.infer<typeof productIdParamsSchema>;
export type CreateProductBody = z.infer<typeof createProductBodySchema>;
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const imageColorBodySchema = z.object({ color: z.string().trim().min(1).max(80).nullable() });
export const renameColorBodySchema = z.object({ from: z.string().trim().min(1).max(80), to: z.string().trim().min(1).max(80) });
