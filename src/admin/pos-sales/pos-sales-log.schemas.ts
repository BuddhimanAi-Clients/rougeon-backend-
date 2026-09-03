import { PosPaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { paginationQueryFields } from '../../shared/http/pagination.js';

export const posSaleIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
export const listPosSalesQuerySchema = z
  .object({
    ...paginationQueryFields,
    staffId: z.string().trim().min(1).max(128).optional(),
    paymentMethod: z.enum(PosPaymentMethod).optional(),
    needsReview: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    saleNumber: z.string().trim().min(1).max(120).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be before or equal to to',
  });

export type PosSaleIdParams = z.infer<typeof posSaleIdParamsSchema>;
export type ListPosSalesQuery = z.infer<typeof listPosSalesQuerySchema>;
