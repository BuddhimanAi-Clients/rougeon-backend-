import { Router } from 'express';
import {
  optionalAuth,
  requireRole,
} from '../../shared/auth/auth.middleware.js';
import { resolveWebsiteContext } from '../../shared/guest-session/guest-session.middleware.js';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as cartController from './cart.controller.js';
import {
  addCartItemBodySchema,
  cartItemParamsSchema,
  updateCartItemBodySchema,
} from './cart.schemas.js';

export const cartRouter = Router();

cartRouter.use(optionalAuth, resolveWebsiteContext);

cartRouter.get('/', cartController.getCart);
cartRouter.post(
  '/items',
  validateRequest({ body: addCartItemBodySchema }),
  cartController.addItem,
);
cartRouter.patch(
  '/items/:itemId',
  validateRequest({ params: cartItemParamsSchema, body: updateCartItemBodySchema }),
  cartController.updateItem,
);
cartRouter.delete(
  '/items/:itemId',
  validateRequest({ params: cartItemParamsSchema }),
  cartController.removeItem,
);
cartRouter.delete('/', cartController.clearCart);
cartRouter.post('/merge', requireRole(['customer']), cartController.mergeCart);
