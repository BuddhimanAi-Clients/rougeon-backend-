import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { validatedBody } from '../../shared/validation/validation.middleware.js';
import { syncQueuedSales } from './sync-queue.service.js';
import type { SyncSalesBody } from './sync.schemas.js';

function getAuthenticatedStaffId(request: Request): string {
  const staffId = request.auth?.user.id;

  if (!staffId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  return staffId;
}

export const syncSalesController: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const staffId = getAuthenticatedStaffId(request);
    const body = validatedBody<SyncSalesBody>(request);
    const results = await syncQueuedSales(staffId, body);

    response.status(200).json({ data: { results } });
  } catch (error) {
    next(error);
  }
};
