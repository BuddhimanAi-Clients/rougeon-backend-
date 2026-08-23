import { Router } from 'express';
import { requireAuth, requireRole } from '../shared/auth/auth.middleware.js';
import { receiptsRouter } from './receipts/receipts.routes.js';
import { syncRouter } from './offline-sync/sync.routes.js';
import { salesRouter } from './sales/sales.routes.js';

export const posRouter = Router();

posRouter.use(requireAuth, requireRole(['cashier', 'admin']));

posRouter.get('/', (_request, response) => {
  response.status(200).json({
    area: 'pos',
    status: 'available',
  });
});

posRouter.use('/receipts', receiptsRouter);
posRouter.use('/sales', salesRouter);
posRouter.use('/sync', syncRouter);
