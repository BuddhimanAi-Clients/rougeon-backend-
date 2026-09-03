import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../shared/validation/validation.middleware.js';
import type {
  CreateSaleBody,
  ListSalesQuery,
  SaleIdParams,
} from './sales.schemas.js';
import {
  createSale,
  getSaleDetail,
  listSalesForStaff,
} from './sales.service.js';

function getAuthenticatedStaffId(request: Request): string {
  const staffId = request.auth?.user.id;

  if (!staffId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  return staffId;
}

export const listSales: RequestHandler = async (request, response, next) => {
  try {
    const staffId = getAuthenticatedStaffId(request);
    const sales = await listSalesForStaff(
      staffId,
      validatedQuery<ListSalesQuery>(request),
    );

    response.status(200).json(sales);
  } catch (error) {
    next(error);
  }
};

export const getSale: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const staffId = getAuthenticatedStaffId(request);
    const { id: saleId } = validatedParams<SaleIdParams>(request);
    const sale = await getSaleDetail(saleId, staffId);

    response.status(200).json({ data: sale });
  } catch (error) {
    next(error);
  }
};

export const createSaleController: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const staffId = getAuthenticatedStaffId(request);
    const body = validatedBody<CreateSaleBody>(request);
    const sale = await createSale(staffId, body);

    response.status(201).json({ data: sale });
  } catch (error) {
    next(error);
  }
};
