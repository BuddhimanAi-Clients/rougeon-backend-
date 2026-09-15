import { Router } from 'express';
import { addressRouter } from './addresses/address.routes.js';
import { cartRouter } from './cart/cart.routes.js';
import { categoryRouter } from './categories/category.routes.js';
import { checkoutRouter } from './checkout/checkout.routes.js';
import { orderRouter } from './orders/order.routes.js';
import { wishlistRouter } from './wishlist/wishlist.routes.js';
import { paymentRouter } from './payments/payment.routes.js';
import { webCustomerRouter } from './customers/customer.routes.js';

export const webRouter = Router();

webRouter.use('/categories', categoryRouter);
webRouter.use('/cart', cartRouter);
webRouter.use('/wishlist', wishlistRouter);
webRouter.use('/addresses', addressRouter);
webRouter.use('/checkout', checkoutRouter);
webRouter.use('/orders', orderRouter);
webRouter.use('/orders', paymentRouter);
webRouter.use('/customers', webCustomerRouter);
