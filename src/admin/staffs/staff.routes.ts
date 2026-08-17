import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as staffController from './staff.controller.js';
import {
  createStaffBodySchema,
  listStaffQuerySchema,
  staffIdParamsSchema,
  updateStaffBodySchema,
} from './staff.schemas.js';

export const staffRouter = Router();

staffRouter.post('/', validateRequest({ body: createStaffBodySchema }), staffController.createStaff);
staffRouter.get('/', validateRequest({ query: listStaffQuerySchema }), staffController.listStaff);
staffRouter.patch(
  '/:id/reactivate',
  validateRequest({ params: staffIdParamsSchema }),
  staffController.reactivateStaff,
);
staffRouter.get('/:id', validateRequest({ params: staffIdParamsSchema }), staffController.getStaff);
staffRouter.patch(
  '/:id',
  validateRequest({ params: staffIdParamsSchema, body: updateStaffBodySchema }),
  staffController.updateStaff,
);
staffRouter.delete(
  '/:id',
  validateRequest({ params: staffIdParamsSchema }),
  staffController.deactivateStaff,
);
