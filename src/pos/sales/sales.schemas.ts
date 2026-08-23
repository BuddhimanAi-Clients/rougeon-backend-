import { z } from 'zod';

const saleItemSchema = z.object({
  variantId: z.string().trim().min(1).max(128),
  qty: z.number().int().positive().safe(),
});

export const saleIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const createSaleBodySchema = z.object({
  items: z.array(saleItemSchema).min(1),
  paymentMethod: z.enum(['cash', 'qr']),
});

export type SaleIdParams = z.infer<typeof saleIdParamsSchema>;
export type CreateSaleBody = z.infer<typeof createSaleBodySchema>;
