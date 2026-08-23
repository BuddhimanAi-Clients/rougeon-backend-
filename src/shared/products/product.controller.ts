import type { RequestHandler } from 'express';
import {
  validatedParams,
  validatedQuery,
} from '../validation/validation.middleware.js';
import type {
  PublicProductListQuery,
  PublicProductSlugParams,
} from './product.schemas.js';
import * as productService from './product.service.js';

export const listProducts: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json(
      await productService.getPublicProducts(
        validatedQuery<PublicProductListQuery>(request),
      ),
    );
};

export const getProduct: RequestHandler = async (request, response) => {
  const { slug } = validatedParams<PublicProductSlugParams>(request);
  response.status(200).json({ data: await productService.getPublicProduct(slug) });
};
