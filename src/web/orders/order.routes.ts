import { Router } from 'express';
import {
  optionalAuth,
  requireAuth,
  requireRole,
} from '../../shared/auth/auth.middleware.js';
import { resolveWebsiteContext } from '../../shared/guest-session/guest-session.middleware.js';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as orderController from './order.controller.js';
import {
  listCustomerOrdersQuerySchema,
  orderIdParamsSchema,
} from './order.schemas.js';

export const orderRouter = Router();

orderRouter.get(
  '/',
  requireAuth,
  requireRole(['customer']),
  validateRequest({ query: listCustomerOrdersQuerySchema }),
  orderController.listOrders,
);
orderRouter.get(
  '/:id/payment-instructions',
  optionalAuth,
  resolveWebsiteContext,
  validateRequest({ params: orderIdParamsSchema }),
  orderController.getPaymentInstructions,
);
orderRouter.get(
  '/:id',
  optionalAuth,
  resolveWebsiteContext,
  validateRequest({ params: orderIdParamsSchema }),
  orderController.getOrder,
);
