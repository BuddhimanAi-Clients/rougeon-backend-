import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import { dashboardSalesQuerySchema, lowStockQuerySchema } from '../../admin/dashboards/dashboard.schemas.js';
import * as controller from './dashboard.controller.js';
export const posDashboardRouter = Router();
posDashboardRouter.get('/sales', validateRequest({ query: dashboardSalesQuerySchema }), controller.sales);
posDashboardRouter.get('/low-stock', validateRequest({ query: lowStockQuerySchema }), controller.lowStock);
