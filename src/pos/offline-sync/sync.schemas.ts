import { z } from 'zod';
import {
  MAX_POS_SALE_ITEMS,
  MAX_POS_SYNC_BATCH_SIZE,
} from '../sales/sales.constants.js';
import {
  posPaymentMethodSchema,
  saleItemSchema,
} from '../sales/sales.schemas.js';

export const queuedSaleSchema = z
  .object({
    clientSaleId: z.uuid(),
    occurredAt: z.iso.datetime({ offset: true }),
    items: z.array(saleItemSchema).min(1).max(MAX_POS_SALE_ITEMS),
    paymentMethod: posPaymentMethodSchema,
  })
  .superRefine((value, context) => {
    const variantIds = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      if (variantIds.has(item.variantId)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'variantId'],
          message: 'A variant may appear only once in a sale',
        });
      }
      variantIds.add(item.variantId);
    }
  });

export const syncSalesBodySchema = z
  .object({
    sales: z.array(queuedSaleSchema).min(1).max(MAX_POS_SYNC_BATCH_SIZE),
  })
  .superRefine((value, context) => {
    const clientSaleIds = new Set<string>();
    for (const [index, sale] of value.sales.entries()) {
      if (clientSaleIds.has(sale.clientSaleId)) {
        context.addIssue({
          code: 'custom',
          path: ['sales', index, 'clientSaleId'],
          message: 'clientSaleId must be unique within a sync batch',
        });
      }
      clientSaleIds.add(sale.clientSaleId);
    }
  });

export type SyncSalesBody = z.infer<typeof syncSalesBodySchema>;
