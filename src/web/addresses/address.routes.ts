import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/auth.middleware.js';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as addressController from './address.controller.js';
import {
  addressIdParamsSchema,
  createAddressBodySchema,
  updateAddressBodySchema,
} from './address.schemas.js';

export const addressRouter = Router();

addressRouter.use(requireAuth, requireRole(['customer']));
addressRouter.get('/', addressController.listAddresses);
addressRouter.post(
  '/',
  validateRequest({ body: createAddressBodySchema }),
  addressController.createAddress,
);
addressRouter.patch(
  '/:id/default',
  validateRequest({ params: addressIdParamsSchema }),
  addressController.makeDefault,
);
addressRouter.patch(
  '/:id',
  validateRequest({ params: addressIdParamsSchema, body: updateAddressBodySchema }),
  addressController.updateAddress,
);
addressRouter.delete(
  '/:id',
  validateRequest({ params: addressIdParamsSchema }),
  addressController.deleteAddress,
);
