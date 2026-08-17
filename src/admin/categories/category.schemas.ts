import { z } from 'zod';

const categoryFields = {
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parentId: z.string().trim().min(1).max(128).nullable(),
};

export const categoryIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
export const createCategoryBodySchema = z.object({
  name: categoryFields.name,
  slug: categoryFields.slug,
  parentId: categoryFields.parentId.optional(),
});
export const updateCategoryBodySchema = z
  .object({
    name: categoryFields.name.optional(),
    slug: categoryFields.slug.optional(),
    parentId: categoryFields.parentId.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type CategoryIdParams = z.infer<typeof categoryIdParamsSchema>;
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;
