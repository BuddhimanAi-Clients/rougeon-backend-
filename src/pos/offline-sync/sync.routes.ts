import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import { syncSalesController } from './sync.controller.js';
import { syncSalesBodySchema } from './sync.schemas.js';

export const syncRouter = Router();

syncRouter.post(
  '/',
  validateRequest({ body: syncSalesBodySchema }),
  syncSalesController,
);
