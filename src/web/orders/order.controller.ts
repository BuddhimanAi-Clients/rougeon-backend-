import type { RequestHandler } from 'express';
import { websiteOwner } from '../../shared/guest-session/guest-session.middleware.js';
import {
  validatedParams,
  validatedQuery,
} from '../../shared/validation/validation.middleware.js';
import type {
  ListCustomerOrdersQuery,
  OrderIdParams,
} from './order.schemas.js';
import * as orderService from './order.service.js';

export const listOrders: RequestHandler = async (request, response) => {
  response.status(200).json(
    await orderService.getCustomerOrders(
      websiteOwner(request),
      validatedQuery<ListCustomerOrdersQuery>(request),
    ),
  );
};

export const getOrder: RequestHandler = async (request, response) => {
  const { id } = validatedParams<OrderIdParams>(request);
  response.status(200).json({
    data: await orderService.getOrder(id, websiteOwner(request)),
  });
};

export const getPaymentInstructions: RequestHandler = async (
  request,
  response,
) => {
  const { id } = validatedParams<OrderIdParams>(request);
  response.status(200).json({
    data: await orderService.getPaymentInstructions(id, websiteOwner(request)),
  });
};
