import type { RequestHandler } from 'express';
import { getActivePaymentQr } from './payment-qr.service.js';

export const getPaymentQr: RequestHandler = async (_request, response, next) => {
  try {
    response.status(200).json({ data: await getActivePaymentQr() });
  } catch (error) {
    next(error);
  }
};
