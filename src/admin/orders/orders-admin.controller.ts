import type { RequestHandler } from 'express';
import { validatedBody, validatedParams, validatedQuery } from '../../shared/validation/validation.middleware.js';
import type { ListOrdersQuery, OrderIdParams, RefundOrderBody, UpdateOrderStatusBody, VerifyPaymentBody } from './orders-admin.schemas.js';
import * as orderService from './orders-admin.service.js';

export const listOrders: RequestHandler = async (request, response) => {
  response.status(200).json(await orderService.getOrders(validatedQuery<ListOrdersQuery>(request)));
};
export const listPendingPayments: RequestHandler = async (request, response) => {
  response.status(200).json(await orderService.getPendingPayments(validatedQuery<ListOrdersQuery>(request)));
};
export const getOrder: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await orderService.getOrder(validatedParams<OrderIdParams>(request).id) });
};
export const getPaymentProof: RequestHandler = async (request, response) => {
  const { id, paymentId } = request.params as { id: string; paymentId: string };
  const proof = await orderService.getPaymentProof(id, paymentId);
  response.type(proof.contentType);
  (proof.body as NodeJS.ReadableStream).pipe(response);
};
export const updateOrderStatus: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await orderService.updateOrderStatus(
      validatedParams<OrderIdParams>(request).id,
      validatedBody<UpdateOrderStatusBody>(request),
    ),
  });
};
export const verifyPayment: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await orderService.verifyPayment(
      validatedParams<OrderIdParams>(request).id,
      request.auth!.user.id,
      validatedBody<VerifyPaymentBody>(request).action,
    ),
  });
};
export const refundCodOrder: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await orderService.refundCodOrder(validatedParams<OrderIdParams>(request).id, validatedBody<RefundOrderBody>(request)) });
};
