import { Router } from 'express';
import { requireAuth, requireRole } from '../shared/auth/auth.middleware.js';

export const posRouter = Router();

posRouter.use(requireAuth, requireRole(['cashier', 'admin']));

posRouter.get('/', (_request, response) => {
  response.status(200).json({
    area: 'pos',
    status: 'available',
  });
});
