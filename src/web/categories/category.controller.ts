import type { RequestHandler } from 'express';
import * as categoryService from './category.service.js';

export const listCategories: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await categoryService.getCategoryTree() });
};
