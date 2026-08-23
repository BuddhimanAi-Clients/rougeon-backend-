import { z } from 'zod';
import { createSaleBodySchema } from '../sales/sales.schemas.js';

export const syncSalesBodySchema = z.object({
  sales: z.array(createSaleBodySchema).min(1),
});

export type SyncSalesBody = z.infer<typeof syncSalesBodySchema>;
