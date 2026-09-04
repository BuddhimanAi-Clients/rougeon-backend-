import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as orderController from './orders-admin.controller.js';
import {
  listOrdersQuerySchema,
  orderIdParamsSchema,
  updateOrderStatusBodySchema,
  verifyPaymentBodySchema,
} from './orders-admin.schemas.js';

export const ordersAdminRouter = Router();

ordersAdminRouter.get('/', validateRequest({ query: listOrdersQuerySchema }), orderController.listOrders);
ordersAdminRouter.get('/pending-payments', validateRequest({ query: listOrdersQuerySchema }), orderController.listPendingPayments);
ordersAdminRouter.get('/:id', validateRequest({ params: orderIdParamsSchema }), orderController.getOrder);
ordersAdminRouter.get('/:id/payments/:paymentId/proof', orderController.getPaymentProof);
ordersAdminRouter.patch('/:id/status', validateRequest({ params: orderIdParamsSchema, body: updateOrderStatusBodySchema }), orderController.updateOrderStatus);
ordersAdminRouter.patch('/:id/verify-payment', validateRequest({ params: orderIdParamsSchema, body: verifyPaymentBodySchema }), orderController.verifyPayment);
