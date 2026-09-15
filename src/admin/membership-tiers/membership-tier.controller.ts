import type { RequestHandler } from 'express';
import { validatedBody, validatedParams } from '../../shared/validation/validation.middleware.js';
import type { MembershipTierBody, MembershipTierPatch } from './membership-tier.schemas.js';
import * as service from './membership-tier.service.js';
export const list: RequestHandler = async (_request, response) => response.json({ data: await service.list() });
export const create: RequestHandler = async (request, response) => response.status(201).json({ data: await service.create(validatedBody<MembershipTierBody>(request), request.auth!.user.id) });
export const update: RequestHandler = async (request, response) => response.json({ data: await service.update(validatedParams<{ id: string }>(request).id, validatedBody<MembershipTierPatch>(request), request.auth!.user.id) });
export const history: RequestHandler = async (request, response) => response.json({ data: await service.history(validatedParams<{ id: string }>(request).id) });
