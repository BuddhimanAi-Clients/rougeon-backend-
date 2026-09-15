import type { RequestHandler } from 'express';
import { validatedQuery } from '../../shared/validation/validation.middleware.js';
import type { DashboardSalesQuery, LowStockQuery } from '../../admin/dashboards/dashboard.schemas.js';
import * as dashboard from '../../admin/dashboards/dashboard.service.js';
export const sales: RequestHandler = async (request, response) => response.json(await dashboard.sales(validatedQuery<DashboardSalesQuery>(request)));
export const lowStock: RequestHandler = async (request, response) => response.json(await dashboard.lowStock(validatedQuery<LowStockQuery>(request).threshold));
