import type { RequestHandler } from 'express';
import { validatedBody, validatedParams, validatedQuery } from '../validation/validation.middleware.js';
import * as service from './shipping.service.js';
import * as rates from './rates.service.js';
export const book: RequestHandler = async (req, res) => { res.status(201).json({ data: await service.bookNcmShipment(validatedParams<{ id: string }>(req).id, validatedBody(req)) }); };
export const webhook: RequestHandler = async (req, res) => { await service.processNcmWebhook(req.body); res.status(204).end(); };
export const branches: RequestHandler = async (_req, res) => { res.set('Cache-Control', 'public, max-age=3600').json({ data: await rates.listBranches() }); };
// Customers only ever see one Delivery amount, so the split stays server-side.
export const quote: RequestHandler = async (req, res) => { const result = await rates.quoteDelivery(validatedQuery<{ branch: string }>(req).branch); res.json({ data: { branch: result.branch, deliveryFee: result.total.toFixed(2) } }); };
