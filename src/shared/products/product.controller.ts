import type { Request, RequestHandler, Response } from 'express';
import {
  validatedParams,
  validatedQuery,
} from '../validation/validation.middleware.js';
import type {
  PublicProductListQuery,
  PublicProductSlugParams,
} from './product.schemas.js';
import * as productService from './product.service.js';

function canViewExactStock(request: Request): boolean {
  const role = request.auth?.user.role;
  return role === 'cashier' || role === 'admin';
}

function configureStockAwareCaching(
  request: Request,
  response: Response,
): boolean {
  const includeExactStock = canViewExactStock(request);
  response.vary('Cookie');
  if (includeExactStock) response.set('Cache-Control', 'private, no-store');
  return includeExactStock;
}

export const listProducts: RequestHandler = async (request, response) => {
  const includeExactStock = configureStockAwareCaching(request, response);
  response
    .status(200)
    .json(
      await productService.getPublicProducts(
        validatedQuery<PublicProductListQuery>(request),
        includeExactStock,
      ),
    );
};

export const getProduct: RequestHandler = async (request, response) => {
  const { slug } = validatedParams<PublicProductSlugParams>(request);
  const includeExactStock = configureStockAwareCaching(request, response);
  response.status(200).json({
    data: await productService.getPublicProduct(slug, includeExactStock),
  });
};
