import type { RequestHandler } from 'express';
import { websiteOwner } from '../../shared/guest-session/guest-session.middleware.js';
import { validatedBody } from '../../shared/validation/validation.middleware.js';
import type { CheckoutBody } from './checkout.schemas.js';
import * as checkoutService from './checkout.service.js';

export const checkout: RequestHandler = async (request, response) => {
  response.status(201).json({
    data: await checkoutService.checkout(
      websiteOwner(request),
      validatedBody<CheckoutBody>(request),
    ),
  });
};
