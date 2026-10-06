import type { RequestHandler } from 'express';
import { validatedBody, validatedParams, validatedQuery } from '../../shared/validation/validation.middleware.js';
import type { CreateProductBody, ListProductsQuery, ProductIdParams, UpdateProductBody } from './product.schemas.js';
import * as productService from './product.service.js';

export const createProduct: RequestHandler = async (request, response) => {
  response.status(201).json({ data: await productService.createProduct(validatedBody<CreateProductBody>(request)) });
};
export const listProducts: RequestHandler = async (request, response) => {
  response.status(200).json(await productService.getProducts(validatedQuery<ListProductsQuery>(request)));
};
export const getProduct: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await productService.getProduct(validatedParams<ProductIdParams>(request).id) });
};
export const updateProduct: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await productService.updateProduct(
      validatedParams<ProductIdParams>(request).id,
      validatedBody<UpdateProductBody>(request),
    ),
  });
};
export const archiveProduct: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await productService.archiveProduct(validatedParams<ProductIdParams>(request).id) });
};
export const addImages: RequestHandler = async (request, response) => {
  const body = (request.body ?? {}) as { color?: unknown; skipExisting?: unknown };
  const result = await productService.addImages(validatedParams<ProductIdParams>(request).id, request.files as Express.Multer.File[] ?? [], {
    color: typeof body.color === 'string' ? body.color.slice(0, 80) : null,
    skipExisting: body.skipExisting === 'true' || body.skipExisting === true,
  });
  response.status(201).json({ data: result.product, meta: { added: result.added, skipped: result.skipped } });
};
export const removeImage: RequestHandler = async (request, response) => {
  const { id } = validatedParams<ProductIdParams>(request);
  const imageId = typeof request.params.imageId === 'string' ? request.params.imageId : undefined;
  if (!imageId) throw new Error('imageId must be provided');
  await productService.removeImage(id, imageId);
  response.status(204).end();
};
export const setImageColor: RequestHandler = async (request, response) => {
  const { id } = validatedParams<ProductIdParams>(request);
  const imageId = typeof request.params.imageId === 'string' ? request.params.imageId : undefined;
  if (!imageId) throw new Error('imageId must be provided');
  response.status(200).json({ data: await productService.setImageColor(id, imageId, validatedBody<{ color: string | null }>(request).color) });
};
export const renameColor: RequestHandler = async (request, response) => {
  const body = validatedBody<{ from: string; to: string }>(request);
  response.status(200).json({ data: await productService.renameColor(validatedParams<ProductIdParams>(request).id, body.from, body.to) });
};
export const catalogOptions: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await productService.getCatalogOptions() });
};
