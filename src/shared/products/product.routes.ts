import { Router } from 'express';
import { optionalAuth } from '../auth/auth.middleware.js';
import { validateRequest } from '../validation/validation.middleware.js';
import * as productController from './product.controller.js';
import {
  publicProductListQuerySchema,
  publicProductSlugParamsSchema,
} from './product.schemas.js';

export const sharedProductRouter = Router();

sharedProductRouter.get(
  '/products',
  optionalAuth,
  validateRequest({ query: publicProductListQuerySchema }),
  productController.listProducts,
);
sharedProductRouter.get(
  '/products/:slug',
  optionalAuth,
  validateRequest({ params: publicProductSlugParamsSchema }),
  productController.getProduct,
);
