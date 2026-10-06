import { z } from 'zod';

const cell = z.union([z.string().max(20_000), z.number().finite()]).optional();

export const importBodySchema = z.object({
  rows: z.array(z.object({
    row: z.number().int().min(1).max(100_000),
    category: cell,
    parentCategory: cell,
    productName: cell,
    description: cell,
    colour: cell,
    size: cell,
    price: cell,
    stock: cell,
    status: cell,
    memberDiscount: cell,
    sku: cell,
  })).min(1, 'The file has no product rows').max(3_000, 'Import at most 3,000 rows at a time'),
  photos: z.array(z.object({
    path: z.string().min(1).max(600),
    product: z.string().min(1).max(300),
    colour: z.string().max(120).nullable().optional(),
    file: z.string().min(1).max(200),
  })).max(20_000).default([]),
  // Names the admin confirmed are new, not typos ("colour:teal").
  confirmedNew: z.array(z.string().max(400)).max(2_000).default([]),
});

export const importIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
export const completeImportBodySchema = z.object({
  photos: z.object({
    uploaded: z.number().int().min(0).max(100_000),
    skipped: z.number().int().min(0).max(100_000),
    failed: z.number().int().min(0).max(100_000),
  }),
});

export type ImportBody = z.infer<typeof importBodySchema>;
export type CompleteImportBody = z.infer<typeof completeImportBodySchema>;
