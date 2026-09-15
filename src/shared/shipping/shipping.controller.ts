import type { RequestHandler } from 'express';
import { validatedBody, validatedParams } from '../validation/validation.middleware.js';
import * as service from './shipping.service.js';
export const book: RequestHandler = async (req, res) => { res.status(201).json({ data: await service.bookNcmShipment(validatedParams<{ id: string }>(req).id, validatedBody(req)) }); };
export const webhook: RequestHandler = async (req, res) => { await service.processNcmWebhook(req.body); res.status(204).end(); };
