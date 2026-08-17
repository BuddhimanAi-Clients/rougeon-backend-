import { AppError } from '../../shared/errors/app-error.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import type { CreateProductBody, ListProductsQuery, UpdateProductBody } from './product.schemas.js';
import * as productRepository from './product.repository.js';

async function requireCategory(categoryId: string) {
  if (!(await productRepository.findCategory(categoryId))) {
    throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category was not found');
  }
}

export async function createProduct(input: CreateProductBody) {
  await requireCategory(input.categoryId);
  return productRepository.createProduct(input);
}

export async function getProducts(query: ListProductsQuery) {
  const [products, total] = await productRepository.listProducts(query);
  return paginatedResult(products, total, query);
}

export async function getProduct(id: string) {
  const product = await productRepository.findProduct(id);
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  return product;
}

export async function updateProduct(id: string, input: UpdateProductBody) {
  await getProduct(id);
  if (input.categoryId) await requireCategory(input.categoryId);
  return productRepository.updateProduct(id, input);
}

export async function archiveProduct(id: string) {
  await getProduct(id);
  return productRepository.archiveProduct(id);
}
