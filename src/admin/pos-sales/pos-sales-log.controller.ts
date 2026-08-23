import type { RequestHandler } from 'express';
import { validatedParams, validatedQuery } from '../../shared/validation/validation.middleware.js';
import type { ListPosSalesQuery, PosSaleIdParams } from './pos-sales-log.schemas.js';
import * as posSalesService from './pos-sales-log.service.js';

export const listPosSales: RequestHandler = async (request, response) => {
  response.status(200).json(await posSalesService.getPosSales(validatedQuery<ListPosSalesQuery>(request)));
};
export const getPosSale: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await posSalesService.getPosSale(validatedParams<PosSaleIdParams>(request).id) });
};
export const resolvePosSaleReview: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await posSalesService.resolvePosSaleReview(
      validatedParams<PosSaleIdParams>(request).id,
    ),
  });
};
