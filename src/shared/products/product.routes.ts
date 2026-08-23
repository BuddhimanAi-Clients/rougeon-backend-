import { Router } from 'express';
import { validateRequest } from '../validation/validation.middleware.js';
import * as productController from './product.controller.js';
import {
  publicProductListQuerySchema,
  publicProductSlugParamsSchema,
} from './product.schemas.js';

export const sharedProductRouter = Router();

sharedProductRouter.get(
  '/products',
  validateRequest({ query: publicProductListQuerySchema }),
  productController.listProducts,
);
sharedProductRouter.get(
  '/products/:slug',
  validateRequest({ params: publicProductSlugParamsSchema }),
  productController.getProduct,
);
