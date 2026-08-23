import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQueryFields } from '../../shared/http/pagination.js';

export const orderIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const listCustomerOrdersQuerySchema = z.object({
  ...paginationQueryFields,
  status: z.enum(OrderStatus).optional(),
});

export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
export type ListCustomerOrdersQuery = z.infer<
  typeof listCustomerOrdersQuerySchema
>;
