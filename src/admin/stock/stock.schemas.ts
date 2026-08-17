import { InventoryReason, InventorySource } from '@prisma/client';
import { z } from 'zod';
import { paginationQueryFields } from '../../shared/http/pagination.js';

export const stockVariantParamsSchema = z.object({ variantId: z.string().trim().min(1).max(128) });
export const restockBodySchema = z.object({ quantity: z.number().int().positive().max(2_147_483_647) });
export const adjustStockBodySchema = z.object({
  adjustment: z.number().int().min(-2_147_483_647).max(2_147_483_647).refine((value) => value !== 0, 'Adjustment cannot be zero'),
});
export const stockLogsQuerySchema = z
  .object({
    ...paginationQueryFields,
    variantId: z.string().trim().min(1).max(128).optional(),
    reason: z.enum(InventoryReason).optional(),
    source: z.enum(InventorySource).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be before or equal to to',
  });

export type StockVariantParams = z.infer<typeof stockVariantParamsSchema>;
export type RestockBody = z.infer<typeof restockBodySchema>;
export type AdjustStockBody = z.infer<typeof adjustStockBodySchema>;
export type StockLogsQuery = z.infer<typeof stockLogsQuerySchema>;
