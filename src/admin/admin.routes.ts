import { Router } from 'express';
import { requireAuth, requireRole } from '../shared/auth/auth.middleware.js';
import { categoryRouter } from './categories/category.routes.js';
import { dashboardRouter } from './dashboards/dashboard.routes.js';
import { ordersAdminRouter } from './orders/orders-admin.routes.js';
import { posSalesLogRouter } from './pos-sales/pos-sales-log.routes.js';
import { productRouter } from './products/product.routes.js';
import { staffRouter } from './staffs/staff.routes.js';
import { stockRouter } from './stock/stock.routes.js';
import { variantRouter } from './variants/variant.routes.js';
import { paymentSettingsRouter } from './payment-settings/payment-settings.routes.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin']));

adminRouter.use('/staffs', staffRouter);
adminRouter.use('/categories', categoryRouter);
adminRouter.use('/products', productRouter);
adminRouter.use('/variants', variantRouter);
adminRouter.use('/stock', stockRouter);
adminRouter.use('/orders', ordersAdminRouter);
adminRouter.use('/pos-sales', posSalesLogRouter);
adminRouter.use('/dashboards', dashboardRouter);
adminRouter.use('/payment-settings', paymentSettingsRouter);
