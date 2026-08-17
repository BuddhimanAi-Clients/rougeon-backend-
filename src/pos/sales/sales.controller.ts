import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { validatedBody } from '../../shared/validation/validation.middleware.js';
import type { CreateSaleBody } from './sales.schemas.js';
import {
  createSale,
  getSaleDetail,
  listSalesForStaff,
} from './sales.service.js';

type SaleParams = {
  id: string;
};

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
    const sales = await listSalesForStaff(staffId);

    response.status(200).json({ data: sales });
  } catch (error) {
    next(error);
  }
};

export const getSale: RequestHandler<SaleParams> = async (
  request,
  response,
  next,
) => {
  try {
    const staffId = getAuthenticatedStaffId(request);
    const saleId = request.params.id;
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
