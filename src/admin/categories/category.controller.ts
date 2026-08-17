import type { RequestHandler } from 'express';
import { validatedBody, validatedParams } from '../../shared/validation/validation.middleware.js';
import type {
  CategoryIdParams,
  CreateCategoryBody,
  UpdateCategoryBody,
} from './category.schemas.js';
import * as categoryService from './category.service.js';

export const createCategory: RequestHandler = async (request, response) => {
  response.status(201).json({ data: await categoryService.createCategory(validatedBody<CreateCategoryBody>(request)) });
};

export const listCategories: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await categoryService.getCategoryTree() });
};

export const updateCategory: RequestHandler = async (request, response) => {
  const { id } = validatedParams<CategoryIdParams>(request);
  response.status(200).json({
    data: await categoryService.updateCategory(id, validatedBody<UpdateCategoryBody>(request)),
  });
};

export const deleteCategory: RequestHandler = async (request, response) => {
  const { id } = validatedParams<CategoryIdParams>(request);
  await categoryService.deleteCategory(id);
  response.status(200).json({ message: 'Category deleted' });
};
