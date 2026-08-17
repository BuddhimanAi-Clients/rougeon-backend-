import type { RequestHandler } from 'express';
import { validatedQuery } from '../../shared/validation/validation.middleware.js';
import type { DashboardSalesQuery, LowStockQuery } from './dashboard.schemas.js';
import * as dashboardService from './dashboard.service.js';

export const sales: RequestHandler = async (request, response) => {
  response.status(200).json(await dashboardService.sales(validatedQuery<DashboardSalesQuery>(request)));
};
export const lowStock: RequestHandler = async (request, response) => {
  response.status(200).json(await dashboardService.lowStock(validatedQuery<LowStockQuery>(request).threshold));
};
