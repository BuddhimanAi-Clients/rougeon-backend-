import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as dashboardController from './dashboard.controller.js';
import { dashboardSalesQuerySchema, lowStockQuerySchema } from './dashboard.schemas.js';

export const dashboardRouter = Router();

dashboardRouter.get('/sales', validateRequest({ query: dashboardSalesQuerySchema }), dashboardController.sales);
dashboardRouter.get('/low-stock', validateRequest({ query: lowStockQuerySchema }), dashboardController.lowStock);
