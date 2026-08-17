import type { RequestHandler } from 'express';
import { validatedBody, validatedParams } from '../../shared/validation/validation.middleware.js';
import type { CreateVariantBody, ProductVariantParams, UpdateVariantBody, VariantIdParams } from './variant.schemas.js';
import * as variantService from './variant.service.js';

export const createVariant: RequestHandler = async (request, response) => {
  const { id } = validatedParams<ProductVariantParams>(request);
  response.status(201).json({ data: await variantService.createVariant(id, validatedBody<CreateVariantBody>(request)) });
};
export const updateVariant: RequestHandler = async (request, response) => {
  const { variantId } = validatedParams<VariantIdParams>(request);
  response.status(200).json({ data: await variantService.updateVariant(variantId, validatedBody<UpdateVariantBody>(request)) });
};
export const deleteVariant: RequestHandler = async (request, response) => {
  await variantService.deleteVariant(validatedParams<VariantIdParams>(request).variantId);
  response.status(200).json({ message: 'Variant deleted' });
};
