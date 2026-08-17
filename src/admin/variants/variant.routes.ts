import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as variantController from './variant.controller.js';
import {
  createVariantBodySchema,
  productVariantParamsSchema,
  updateVariantBodySchema,
  variantIdParamsSchema,
} from './variant.schemas.js';

export const productVariantRouter = Router({ mergeParams: true });
export const variantRouter = Router();

productVariantRouter.post(
  '/',
  validateRequest({ params: productVariantParamsSchema, body: createVariantBodySchema }),
  variantController.createVariant,
);
variantRouter.patch(
  '/:variantId',
  validateRequest({ params: variantIdParamsSchema, body: updateVariantBodySchema }),
  variantController.updateVariant,
);
variantRouter.delete(
  '/:variantId',
  validateRequest({ params: variantIdParamsSchema }),
  variantController.deleteVariant,
);
