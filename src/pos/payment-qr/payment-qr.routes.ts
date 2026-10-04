import { Router } from 'express';
import { getPaymentQr } from './payment-qr.controller.js';

export const posPaymentQrRouter = Router();

posPaymentQrRouter.get('/', getPaymentQr);
