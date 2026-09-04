import { AppError } from '../../shared/errors/app-error.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import type { CreateProductBody, ListProductsQuery, UpdateProductBody } from './product.schemas.js';
import * as productRepository from './product.repository.js';
import { createObjectKey, deleteObject, inspectImage, publicMediaUrl, uploadImage } from '../../shared/media/media.service.js';

const MAX_PRODUCT_IMAGES = 20;
const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;

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

export async function addImages(id: string, files: Express.Multer.File[]) {
  const product = await getProduct(id);
  if (files.length === 0) throw new AppError(400, 'IMAGE_REQUIRED', 'Select at least one image');
  if (product.media.length + files.length > MAX_PRODUCT_IMAGES) {
    throw new AppError(400, 'PRODUCT_IMAGE_LIMIT', `A product can have at most ${MAX_PRODUCT_IMAGES} images`);
  }
  const inspected = await Promise.all(files.map((file) => inspectImage(file, MAX_PRODUCT_IMAGE_BYTES)));
  const uploads = inspected.map((image) => ({ image, objectKey: createObjectKey(`products/${id}`, image.extension) }));
  const uploaded: string[] = [];
  try {
    for (const upload of uploads) {
      await uploadImage(upload.objectKey, upload.image);
      uploaded.push(upload.objectKey);
    }
    return await productRepository.addProductImages(id, uploads.map((upload, index) => ({
      objectKey: upload.objectKey,
      publicUrl: publicMediaUrl(upload.objectKey),
      detectedMimeType: upload.image.mimeType,
      byteSize: upload.image.byteSize,
      sortOrder: product.media.length + index,
    })));
  } catch (error) {
    await Promise.allSettled(uploaded.map((key) => deleteObject(key)));
    throw error;
  }
}

export async function removeImage(productId: string, imageId: string) {
  await getProduct(productId);
  const image = await productRepository.removeProductImage(productId, imageId);
  if (!image) throw new AppError(404, 'PRODUCT_IMAGE_NOT_FOUND', 'Product image was not found');
  if (image.objectKey) await deleteObject(image.objectKey);
}
