import { Router } from 'express';
import { imageUpload, mediaUploadError } from '../../shared/media/media.middleware.js';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as controller from './payment-settings.controller.js';
import { paymentQrConfigurationBodySchema, paymentQrConfigurationIdParamsSchema } from './payment-settings.schemas.js';

export const paymentSettingsRouter = Router();
paymentSettingsRouter.get('/qr-configurations', controller.listConfigurations);
paymentSettingsRouter.post('/qr-configurations', imageUpload(4 * 1024 * 1024, 1).single('qr'), mediaUploadError, validateRequest({ body: paymentQrConfigurationBodySchema }), controller.createConfiguration);
paymentSettingsRouter.post('/qr-configurations/:id/activate', validateRequest({ params: paymentQrConfigurationIdParamsSchema }), controller.reactivateConfiguration);
paymentSettingsRouter.patch('/qr-configurations/:id', validateRequest({ params: paymentQrConfigurationIdParamsSchema, body: paymentQrConfigurationBodySchema }), controller.updateConfigurationMetadata);
