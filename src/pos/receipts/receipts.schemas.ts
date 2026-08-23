import { z } from 'zod';

export const receiptSaleParamsSchema = z.object({
  saleId: z.string().trim().min(1).max(128),
});

export type ReceiptSaleParams = z.infer<typeof receiptSaleParamsSchema>;
