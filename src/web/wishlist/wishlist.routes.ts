import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/auth.middleware.js';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as wishlistController from './wishlist.controller.js';
import {
  addWishlistItemBodySchema,
  wishlistVariantParamsSchema,
} from './wishlist.schemas.js';

export const wishlistRouter = Router();

wishlistRouter.use(requireAuth, requireRole(['customer']));
wishlistRouter.get('/', wishlistController.listWishlist);
wishlistRouter.post(
  '/items',
  validateRequest({ body: addWishlistItemBodySchema }),
  wishlistController.addItem,
);
wishlistRouter.delete(
  '/items/:variantId',
  validateRequest({ params: wishlistVariantParamsSchema }),
  wishlistController.removeItem,
);
