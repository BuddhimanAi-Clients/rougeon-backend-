import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import {
  createSaleController,
  getSale,
  listSales,
} from './sales.controller.js';
import {
  createSaleBodySchema,
  saleIdParamsSchema,
} from './sales.schemas.js';

export const salesRouter = Router();

salesRouter.post(
  '/',
  validateRequest({ body: createSaleBodySchema }),
  createSaleController,
);

salesRouter.get('/', listSales);

salesRouter.get(
  '/:id',
  validateRequest({ params: saleIdParamsSchema }),
  getSale,
);