import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import { productVariantRouter } from '../variants/variant.routes.js';
import * as productController from './product.controller.js';
import {
  createProductBodySchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  updateProductBodySchema,
} from './product.schemas.js';

export const productRouter = Router();

productRouter.post('/', validateRequest({ body: createProductBodySchema }), productController.createProduct);
productRouter.get('/', validateRequest({ query: listProductsQuerySchema }), productController.listProducts);
productRouter.use('/:id/variants', productVariantRouter);
productRouter.get('/:id', validateRequest({ params: productIdParamsSchema }), productController.getProduct);
productRouter.patch('/:id', validateRequest({ params: productIdParamsSchema, body: updateProductBodySchema }), productController.updateProduct);
productRouter.delete('/:id', validateRequest({ params: productIdParamsSchema }), productController.archiveProduct);
