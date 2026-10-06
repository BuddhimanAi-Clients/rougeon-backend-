import { Router, type RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { validateRequest, validatedBody, validatedParams } from '../../shared/validation/validation.middleware.js';
import { completeImportBodySchema, importBodySchema, importIdParamsSchema, type CompleteImportBody, type ImportBody } from './import.schemas.js';
import * as importService from './import.service.js';

const check: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await importService.checkImport(validatedBody<ImportBody>(request)) });
};
const apply: RequestHandler = async (request, response) => {
  const actorId = request.auth?.user.id;
  if (!actorId) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  response.status(201).json({ data: await importService.applyImport(actorId, validatedBody<ImportBody>(request)) });
};
const complete: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await importService.completeImport(validatedParams<{ id: string }>(request).id, validatedBody<CompleteImportBody>(request)) });
};
const list: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await importService.listImports() });
};

export const importRouter = Router();
importRouter.get('/products', list);
importRouter.post('/products/check', validateRequest({ body: importBodySchema }), check);
importRouter.post('/products/apply', validateRequest({ body: importBodySchema }), apply);
importRouter.post('/products/:id/complete', validateRequest({ params: importIdParamsSchema, body: completeImportBodySchema }), complete);
