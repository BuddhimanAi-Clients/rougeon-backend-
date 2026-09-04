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
};

export const productIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
export const createProductBodySchema = z.object(productFields);
export const updateProductBodySchema = z
  .object({
    categoryId: productFields.categoryId.optional(),
    name: productFields.name.optional(),
    slug: productFields.slug.optional(),
    description: productFields.description.optional(),
    images: productFields.images.optional(),
    status: productFields.status.optional(),
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
