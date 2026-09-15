import { z } from 'zod';
import { paginationQueryFields } from '../http/pagination.js';
export const customerSortValues = ['current_year_spend_desc', 'current_year_spend_asc', 'lifetime_spend_desc', 'lifetime_spend_asc', 'membership_rank_desc', 'membership_rank_asc', 'name_asc', 'name_desc'] as const;
export const customerDirectoryQuerySchema = z.object({ ...paginationQueryFields, search: z.string().trim().min(1).max(120).optional(), sort: z.enum(customerSortValues).default('current_year_spend_desc'), membershipTierId: z.string().trim().min(1).max(128).optional(), membershipStatus: z.enum(['none']).optional() }).superRefine((value, context) => { if (value.membershipTierId && value.membershipStatus) context.addIssue({ code: 'custom', message: 'Use membershipTierId or membershipStatus, not both' }); });
export const customerIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
export const birthdayQuerySchema = z.object({ ...paginationQueryFields, mode: z.enum(['today', 'upcoming']).default('today') });
export type CustomerDirectoryQuery = z.infer<typeof customerDirectoryQuerySchema>;
export type BirthdayQuery = z.infer<typeof birthdayQuerySchema>;
