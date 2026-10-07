import { z } from 'zod';
import { DELIVERY_TYPES } from '../../shared/shipping/delivery-types.js';

// Home delivery or collection from the courier branch. Older clients that do
// not send it keep getting home delivery.
const deliveryType = z.enum(DELIVERY_TYPES).default('Door2Door');

const authenticatedCheckoutSchema = z
  .object({
    shippingAddressId: z.string().trim().min(1).max(128),
    paymentMethod: z.enum(['qr', 'cod']).default('qr'),
    deliveryType,
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
        // Nepal Can Move delivery area; required while live rates are on.
        ncmBranch: z.string().trim().min(1).max(120).optional(),
      })
      .strict(),
    paymentMethod: z.enum(['qr', 'cod']).default('qr'),
    deliveryType,
  })
  .strict();

export const checkoutBodySchema = z.union([
  authenticatedCheckoutSchema,
  guestCheckoutSchema,
]);

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
