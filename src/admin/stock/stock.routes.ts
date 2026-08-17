import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as stockController from './stock.controller.js';
import { adjustStockBodySchema, restockBodySchema, stockLogsQuerySchema, stockVariantParamsSchema } from './stock.schemas.js';

export const stockRouter = Router();

stockRouter.get('/logs', validateRequest({ query: stockLogsQuerySchema }), stockController.listLogs);
stockRouter.patch('/:variantId/restock', validateRequest({ params: stockVariantParamsSchema, body: restockBodySchema }), stockController.restock);
stockRouter.patch('/:variantId/adjust', validateRequest({ params: stockVariantParamsSchema, body: adjustStockBodySchema }), stockController.adjust);
