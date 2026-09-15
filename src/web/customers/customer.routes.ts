import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/auth.middleware.js';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import { customerProfileInputSchema } from '../../shared/customers/customer.schemas.js';
import * as controller from './customer.controller.js';

export const webCustomerRouter = Router();
webCustomerRouter.use(requireAuth, requireRole(['customer']));
webCustomerRouter.post('/membership-signup', validateRequest({ body: customerProfileInputSchema }), controller.saveMembershipSignup);
webCustomerRouter.get('/me', controller.getMine);
webCustomerRouter.put('/me', validateRequest({ body: customerProfileInputSchema }), controller.saveMine);
