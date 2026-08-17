import type { RequestHandler } from 'express';
import { validatedBody, validatedParams, validatedQuery } from '../../shared/validation/validation.middleware.js';
import type { AdjustStockBody, RestockBody, StockLogsQuery, StockVariantParams } from './stock.schemas.js';
import * as stockService from './stock.service.js';

export const restock: RequestHandler = async (request, response) => {
  const { variantId } = validatedParams<StockVariantParams>(request);
  const { quantity } = validatedBody<RestockBody>(request);
  response.status(200).json({ data: await stockService.restock(variantId, quantity, request.auth!.user.id) });
};
export const adjust: RequestHandler = async (request, response) => {
  const { variantId } = validatedParams<StockVariantParams>(request);
  const { adjustment } = validatedBody<AdjustStockBody>(request);
  response.status(200).json({ data: await stockService.adjust(variantId, adjustment, request.auth!.user.id) });
};
export const listLogs: RequestHandler = async (request, response) => {
  response.status(200).json(await stockService.listLogs(validatedQuery<StockLogsQuery>(request)));
};
