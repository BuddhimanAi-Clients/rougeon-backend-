import { OrderPaymentStatus, OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQueryFields } from '../../shared/http/pagination.js';

const dateRangeFields = {
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
};

export const orderIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
export const listOrdersQuerySchema = z
  .object({
    ...paginationQueryFields,
    status: z.enum(OrderStatus).optional(),
    paymentStatus: z.enum(OrderPaymentStatus).optional(),
    search: z.string().trim().min(1).max(180).optional(),
    ...dateRangeFields,
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be before or equal to to',
  });
export const updateOrderStatusBodySchema = z.object({
  status: z.enum(OrderStatus),
  trackingRef: z.string().trim().min(1).max(180).nullable().optional(),
});
export const verifyPaymentBodySchema = z.object({ action: z.enum(['confirm', 'reject']) });
export const refundOrderBodySchema = z.object({
  action: z.enum(['request', 'complete']),
  reason: z.string().trim().min(3).max(1_000).optional(),
  reference: z.string().trim().min(1).max(180).optional(),
});

export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusBody = z.infer<typeof updateOrderStatusBodySchema>;
export type VerifyPaymentBody = z.infer<typeof verifyPaymentBodySchema>;
export type RefundOrderBody = z.infer<typeof refundOrderBodySchema>;
