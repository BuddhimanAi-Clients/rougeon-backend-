import { z } from 'zod';

const dateParts = z.object({ year: z.number().int().min(1900).max(2100), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(32) }).strict();

export const customerProfileInputSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(32),
  email: z.string().trim().email().max(254),
  dobCalendar: z.enum(['AD', 'BS']),
  dob: dateParts,
}).strict();

export type CustomerProfileInput = z.infer<typeof customerProfileInputSchema>;
