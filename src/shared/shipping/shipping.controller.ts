import type { RequestHandler } from 'express';
import { validatedBody, validatedParams, validatedQuery } from '../validation/validation.middleware.js';
import * as service from './shipping.service.js';
import * as rates from './rates.service.js';
export const book: RequestHandler = async (req, res) => { res.status(201).json({ data: await service.bookNcmShipment(validatedParams<{ id: string }>(req).id, validatedBody(req)) }); };
export const webhook: RequestHandler = async (req, res) => { await service.processNcmWebhook(req.body); res.status(204).end(); };
export const branches: RequestHandler = async (_req, res) => { res.set('Cache-Control', 'public, max-age=3600').json({ data: await rates.listBranches() }); };
// Customers only ever see one Delivery amount, so the split stays server-side.
export const quote: RequestHandler = async (req, res) => { const options = await rates.quoteDeliveryOptions(validatedQuery<{ branch: string }>(req).branch); const home = options[0]!; res.json({ data: { branch: home.branch, deliveryFee: home.total.toFixed(2), options: options.map((option) => ({ deliveryType: option.deliveryType, deliveryFee: option.total.toFixed(2) })) } }); };
