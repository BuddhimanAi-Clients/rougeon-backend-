import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as posSalesController from './pos-sales-log.controller.js';
import { listPosSalesQuerySchema, posSaleIdParamsSchema } from './pos-sales-log.schemas.js';

export const posSalesLogRouter = Router();

posSalesLogRouter.get('/', validateRequest({ query: listPosSalesQuerySchema }), posSalesController.listPosSales);
posSalesLogRouter.get('/:id', validateRequest({ params: posSaleIdParamsSchema }), posSalesController.getPosSale);
