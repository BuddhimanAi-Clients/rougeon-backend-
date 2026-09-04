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
  response.status(201).json({ data: await productService.addImages(validatedParams<ProductIdParams>(request).id, request.files as Express.Multer.File[] ?? []) });
};
export const removeImage: RequestHandler = async (request, response) => {
  const { id } = validatedParams<ProductIdParams>(request);
  const imageId = typeof request.params.imageId === 'string' ? request.params.imageId : undefined;
  if (!imageId) throw new Error('imageId must be provided');
  await productService.removeImage(id, imageId);
  response.status(204).end();
};
