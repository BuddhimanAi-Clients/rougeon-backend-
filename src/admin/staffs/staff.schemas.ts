import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { paginationQueryFields } from '../../shared/http/pagination.js';

export const staffIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const createStaffBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum([UserRole.cashier, UserRole.admin]),
});

export const updateStaffBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.email().transform((value) => value.toLowerCase()).optional(),
    phone: z.string().trim().min(5).max(30).nullable().optional(),
    role: z.enum([UserRole.cashier, UserRole.admin]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listStaffQuerySchema = z.object({
  ...paginationQueryFields,
  role: z.enum([UserRole.cashier, UserRole.admin]).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export type CreateStaffBody = z.infer<typeof createStaffBodySchema>;
export type UpdateStaffBody = z.infer<typeof updateStaffBodySchema>;
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
export type StaffIdParams = z.infer<typeof staffIdParamsSchema>;
