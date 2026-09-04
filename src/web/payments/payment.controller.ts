import type { RequestHandler } from 'express';
import { websiteOwner } from '../../shared/guest-session/guest-session.middleware.js';
import { validatedParams } from '../../shared/validation/validation.middleware.js';
import * as service from './payment.service.js';

export const submitPaymentProof: RequestHandler = async (request, response) => {
  response.status(201).json({ data: await service.submitPaymentProof(validatedParams<{ id: string }>(request).id, websiteOwner(request), request.file) });
};
