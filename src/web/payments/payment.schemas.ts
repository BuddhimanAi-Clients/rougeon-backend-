import { z } from 'zod';

export const paymentOrderIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
