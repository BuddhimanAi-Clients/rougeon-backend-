import { z } from 'zod';

const authenticatedCheckoutSchema = z
  .object({
    shippingAddressId: z.string().trim().min(1).max(128),
    paymentMethod: z.enum(['qr', 'cod']).default('qr'),
  })
  .strict();

const guestCheckoutSchema = z
  .object({
    guest: z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(320).optional(),
        phone: z.string().trim().min(5).max(30),
        fullAddress: z.string().trim().min(5).max(2_000),
        city: z.string().trim().min(1).max(120),
      })
      .strict(),
    paymentMethod: z.enum(['qr', 'cod']).default('qr'),
  })
  .strict();

export const checkoutBodySchema = z.union([
  authenticatedCheckoutSchema,
  guestCheckoutSchema,
]);

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
