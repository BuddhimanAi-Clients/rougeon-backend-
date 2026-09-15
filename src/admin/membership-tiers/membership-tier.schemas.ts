import { z } from 'zod';
export const membershipTierBodySchema = z.object({ name: z.string().trim().min(2).max(80), threshold: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/), discountPercent: z.string().regex(/^\d{1,2}(?:\.\d{1,2})?$/).refine((value) => Number(value) <= 100), benefits: z.string().trim().min(1).max(4_000), birthdayGiftDescription: z.string().trim().min(1).max(1_000), rank: z.number().int().min(1).max(1_000), isActive: z.boolean().optional() }).strict();
export const membershipTierPatchSchema = membershipTierBodySchema.partial().refine((value) => Object.keys(value).length > 0);
export const membershipTierParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
export type MembershipTierBody = z.infer<typeof membershipTierBodySchema>;
export type MembershipTierPatch = z.infer<typeof membershipTierPatchSchema>;
