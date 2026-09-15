import { z } from 'zod';
import { paginationQueryFields } from '../../shared/http/pagination.js';
import {
  MAX_POS_ITEM_QUANTITY,
  MAX_POS_SALE_ITEMS,
} from './sales.constants.js';

export const saleItemSchema = z.object({
  variantId: z.string().trim().min(1).max(128),
  qty: z.number().int().positive().max(MAX_POS_ITEM_QUANTITY),
});

export const posPaymentMethodSchema = z.enum(['cash', 'qr']);

export const saleIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const createSaleBodySchema = z
  .object({
    items: z.array(saleItemSchema).min(1).max(MAX_POS_SALE_ITEMS),
    paymentMethod: posPaymentMethodSchema,
    customerProfileId: z.string().trim().min(1).max(128),
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

export const listSalesQuerySchema = z.object({
  ...paginationQueryFields,
});

export type SaleIdParams = z.infer<typeof saleIdParamsSchema>;
export type CreateSaleBody = z.infer<typeof createSaleBodySchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
