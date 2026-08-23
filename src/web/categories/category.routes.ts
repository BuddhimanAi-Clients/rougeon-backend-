import { Router } from 'express';
import * as categoryController from './category.controller.js';

export const categoryRouter = Router();

categoryRouter.get('/', categoryController.listCategories);
