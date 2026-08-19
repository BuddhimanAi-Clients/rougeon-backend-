import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import { getReceipt } from './receipts.controller.js';
import { receiptSaleParamsSchema } from './receipts.schemas.js';

export const receiptsRouter = Router();

receiptsRouter.get(
  '/:saleId',
  validateRequest({ params: receiptSaleParamsSchema }),
  getReceipt,
);