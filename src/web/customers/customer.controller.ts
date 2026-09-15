import type { RequestHandler } from 'express';
import { validatedBody } from '../../shared/validation/validation.middleware.js';
import type { CustomerProfileInput } from '../../shared/customers/customer.schemas.js';
import * as service from './customer.service.js';

export const getMine: RequestHandler = async (request, response) => response.status(200).json({ data: await service.getMine(request.auth!.user.id) });
export const saveMembershipSignup: RequestHandler = async (request, response) => response.status(201).json({ data: await service.saveMembershipSignup(request.auth!.user.id, validatedBody<CustomerProfileInput>(request)) });
export const saveMine: RequestHandler = async (request, response) => response.status(200).json({ data: await service.saveMine(request.auth!.user.id, validatedBody<CustomerProfileInput>(request)) });
