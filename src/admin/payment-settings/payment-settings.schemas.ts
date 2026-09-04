import { z } from 'zod';

export const paymentQrConfigurationIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const paymentQrConfigurationBodySchema = z.object({
  providerName: z.string().trim().min(1).max(120).optional(),
  accountName: z.string().trim().min(1).max(180).optional(),
  accountIdentifier: z.string().trim().min(1).max(180).optional(),
  instructions: z.string().trim().min(1).max(1_000).optional(),
});

export type PaymentQrConfigurationBody = z.infer<typeof paymentQrConfigurationBodySchema>;
