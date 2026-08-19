import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { validatedParams } from '../../shared/validation/validation.middleware.js';
import type { ReceiptSaleParams } from './receipts.schemas.js';
import { getReceiptForStaff } from './receipts.service.js';

function getAuthenticatedStaffId(request: Request): string {
  const staffId = request.auth?.user.id;

  if (!staffId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  return staffId;
}

export const getReceipt: RequestHandler = async (request, response, next) => {
  try {
    const staffId = getAuthenticatedStaffId(request);
    const { saleId } = validatedParams<ReceiptSaleParams>(request);
    const receipt = await getReceiptForStaff(saleId, staffId);

    response.status(200).json({ data: receipt });
  } catch (error) {
    next(error);
  }
};