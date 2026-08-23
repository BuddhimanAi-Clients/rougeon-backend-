import { z } from 'zod';

const addressFields = {
  label: z.string().trim().min(1).max(80),
  fullAddress: z.string().trim().min(5).max(2_000),
  city: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(30),
  isDefault: z.boolean(),
};

export const addressIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const createAddressBodySchema = z.object({
  label: addressFields.label,
  fullAddress: addressFields.fullAddress,
  city: addressFields.city,
  phone: addressFields.phone,
  isDefault: addressFields.isDefault.default(false),
});

export const updateAddressBodySchema = z
  .object({
    label: addressFields.label.optional(),
    fullAddress: addressFields.fullAddress.optional(),
    city: addressFields.city.optional(),
    phone: addressFields.phone.optional(),
    isDefault: addressFields.isDefault.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type AddressIdParams = z.infer<typeof addressIdParamsSchema>;
export type CreateAddressBody = z.infer<typeof createAddressBodySchema>;
export type UpdateAddressBody = z.infer<typeof updateAddressBodySchema>;
