import { Router } from 'express';
import { optionalAuth } from '../../shared/auth/auth.middleware.js';
import { resolveWebsiteContext } from '../../shared/guest-session/guest-session.middleware.js';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as checkoutController from './checkout.controller.js';
import { checkoutBodySchema } from './checkout.schemas.js';

export const checkoutRouter = Router();

checkoutRouter.post(
  '/',
  optionalAuth,
  resolveWebsiteContext,
  validateRequest({ body: checkoutBodySchema }),
  checkoutController.checkout,
);
