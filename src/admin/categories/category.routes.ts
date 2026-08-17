import { Router } from 'express';
import { validateRequest } from '../../shared/validation/validation.middleware.js';
import * as categoryController from './category.controller.js';
import {
  categoryIdParamsSchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from './category.schemas.js';

export const categoryRouter = Router();

categoryRouter.post('/', validateRequest({ body: createCategoryBodySchema }), categoryController.createCategory);
categoryRouter.get('/', categoryController.listCategories);
categoryRouter.patch(
  '/:id',
  validateRequest({ params: categoryIdParamsSchema, body: updateCategoryBodySchema }),
  categoryController.updateCategory,
);
categoryRouter.delete(
  '/:id',
  validateRequest({ params: categoryIdParamsSchema }),
  categoryController.deleteCategory,
);
