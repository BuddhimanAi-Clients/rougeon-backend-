import { Router } from 'express';
import { requireAuth, requireRole } from '../shared/auth/auth.middleware.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin']));

adminRouter.get('/', (_request, response) => {
  response.status(200).json({
    area: 'admin',
    status: 'available',
  });
});
