import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import { membershipTierBodySchema, membershipTierParamsSchema, membershipTierPatchSchema } from './membership-tier.schemas.js';
import * as controller from './membership-tier.controller.js';
export const membershipTierRouter = Router();
membershipTierRouter.get('/', controller.list);
membershipTierRouter.post('/', validateRequest({ body: membershipTierBodySchema }), controller.create);
membershipTierRouter.get('/:id/history', validateRequest({ params: membershipTierParamsSchema }), controller.history);
membershipTierRouter.patch('/:id', validateRequest({ params: membershipTierParamsSchema, body: membershipTierPatchSchema }), controller.update);
