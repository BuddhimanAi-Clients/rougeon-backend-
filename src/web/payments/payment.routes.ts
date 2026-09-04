import { Router } from 'express';
import { optionalAuth } from '../../shared/auth/auth.middleware.js';
import { resolveWebsiteContext } from '../../shared/guest-session/guest-session.middleware.js';
import { imageUpload, mediaUploadError } from '../../shared/media/media.middleware.js';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as controller from './payment.controller.js';
import { paymentOrderIdParamsSchema } from './payment.schemas.js';

export const paymentRouter = Router();
paymentRouter.post('/:id/payment-proof', optionalAuth, resolveWebsiteContext, validateRequest({ params: paymentOrderIdParamsSchema }), imageUpload(8 * 1024 * 1024, 1).single('screenshot'), mediaUploadError, controller.submitPaymentProof);
