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

export const posPaymentMethodSchema = z.enum(['cash', 'qr', 'split']);

const splitAmountSchema = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Must be an amount with at most two decimal places');

// Part cash, part QR. The server checks the two add up to its own total.
export const splitPaymentSchema = z.object({
  cashAmount: splitAmountSchema,
  qrAmount: splitAmountSchema,
});

export function refineSplitPayment(
  value: { paymentMethod: 'cash' | 'qr' | 'split'; split?: { cashAmount: string; qrAmount: string } | undefined },
  context: z.RefinementCtx,
) {
  if (value.paymentMethod === 'split' && !value.split) {
    context.addIssue({ code: 'custom', path: ['split'], message: 'Cash and QR amounts are required for a split payment' });
  }
  if (value.paymentMethod !== 'split' && value.split) {
    context.addIssue({ code: 'custom', path: ['split'], message: 'Split amounts are only allowed with the split payment method' });
  }
  if (value.paymentMethod === 'split' && value.split) {
    for (const key of ['cashAmount', 'qrAmount'] as const) {
      if (!(Number(value.split[key]) > 0)) {
        context.addIssue({ code: 'custom', path: ['split', key], message: 'Each part of a split payment must be more than zero' });
      }
    }
  }
}

export const saleIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const createSaleBodySchema = z
  .object({
    items: z.array(saleItemSchema).min(1).max(MAX_POS_SALE_ITEMS),
    paymentMethod: posPaymentMethodSchema,
    split: splitPaymentSchema.optional(),
    customerProfileId: z.string().trim().min(1).max(128),
    // A cashier may withhold a membership discount the customer qualifies for.
    // The server decides whether there was a discount to withhold and records
    // who did it and why; it can never be used to grant a discount.
    applyMembershipDiscount: z.boolean().default(true),
    discountWaiverReason: z.string().trim().min(3).max(300).optional(),
  })
  .superRefine((value, context) => {
    refineSplitPayment(value, context);
    if (!value.applyMembershipDiscount && !value.discountWaiverReason) {
      context.addIssue({
        code: 'custom',
        path: ['discountWaiverReason'],
        message: 'A reason is required when the membership discount is not applied',
      });
    }
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
