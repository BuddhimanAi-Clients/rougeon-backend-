import type { RequestHandler } from 'express';
import { validatedBody, validatedParams } from '../../shared/validation/validation.middleware.js';
import type { PaymentQrConfigurationBody } from './payment-settings.schemas.js';
import * as service from './payment-settings.service.js';

export const listConfigurations: RequestHandler = async (_request, response) => { response.status(200).json({ data: await service.listConfigurations() }); };
export const createConfiguration: RequestHandler = async (request, response) => { response.status(201).json({ data: await service.createConfiguration(request.auth!.user.id, validatedBody<PaymentQrConfigurationBody>(request), request.file) }); };
export const reactivateConfiguration: RequestHandler = async (request, response) => { response.status(200).json({ data: await service.reactivateConfiguration(validatedParams<{ id: string }>(request).id, request.auth!.user.id) }); };
export const updateConfigurationMetadata: RequestHandler = async (request, response) => { response.status(200).json({ data: await service.updateConfigurationMetadata(validatedParams<{ id: string }>(request).id, validatedBody<PaymentQrConfigurationBody>(request)) }); };
