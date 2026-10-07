import { AppError } from '../../shared/errors/app-error.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import type { CreateProductBody, ListProductsQuery, UpdateProductBody } from './product.schemas.js';
import * as productRepository from './product.repository.js';
import { generateSlug } from '../../shared/catalog/catalog-db.js';
import { STANDARD_SIZES, nameKey, normalizeColour } from '../../shared/catalog/catalog-text.js';
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
  const slug = input.slug ?? await generateSlug(input.name, async (candidate) => Boolean(await productRepository.slugExists(candidate)));
  return productRepository.createProduct({ ...input, slug });
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

function productColors(product: { variants: Array<{ color: string }> }) {
  return [...new Set(product.variants.map((variant) => variant.color))];
}

/** A photo's colour must be one this product is actually sold in. */
function resolveImageColor(product: { variants: Array<{ color: string }> }, raw: string | null | undefined) {
  if (!raw || !raw.trim()) return null;
  const wanted = normalizeColour(raw);
  const match = productColors(product).find((color) => nameKey(color) === nameKey(wanted));
  if (!match) {
    throw new AppError(422, 'PRODUCT_COLOR_UNKNOWN', `This product has no ${wanted} variant. Add the variant first, or upload these as general photos.`);
  }
  return match;
}

export async function addImages(
  id: string,
  files: Express.Multer.File[],
  options: { color?: string | null; skipExisting?: boolean } = {},
) {
  const product = await getProduct(id);
  if (files.length === 0) throw new AppError(400, 'IMAGE_REQUIRED', 'Select at least one image');
  const color = resolveImageColor(product, options.color);
  // Re-running an import must not upload the same file again.
  const already = new Set(product.media.filter((image) => (image.color ?? null) === color && image.sourceName).map((image) => image.sourceName));
  const fresh = options.skipExisting ? files.filter((file) => !already.has(file.originalname)) : files;
  const skipped = files.length - fresh.length;
  if (fresh.length === 0) return { product, added: 0, skipped };
  if (product.media.length + fresh.length > MAX_PRODUCT_IMAGES) {
    throw new AppError(400, 'PRODUCT_IMAGE_LIMIT', `A product can have at most ${MAX_PRODUCT_IMAGES} images`);
  }
  const inspected = await Promise.all(fresh.map((file) => inspectImage(file, MAX_PRODUCT_IMAGE_BYTES, { pngOnly: true })));
  const uploads = inspected.map((image, index) => ({ image, sourceName: fresh[index]!.originalname.slice(0, 200), objectKey: createObjectKey(`products/${id}`, image.extension) }));
  const uploaded: string[] = [];
  // After a photo is removed the count can be lower than the highest position.
  const nextSortOrder = product.media.reduce((highest, image) => Math.max(highest, image.sortOrder), -1) + 1;
  try {
    for (const upload of uploads) {
      await uploadImage(upload.objectKey, upload.image);
      uploaded.push(upload.objectKey);
    }
    const updated = await productRepository.addProductImages(id, uploads.map((upload, index) => ({
      objectKey: upload.objectKey,
      publicUrl: publicMediaUrl(upload.objectKey),
      detectedMimeType: upload.image.mimeType,
      byteSize: upload.image.byteSize,
      sortOrder: nextSortOrder + index,
      color,
      sourceName: upload.sourceName,
    })));
    return { product: updated, added: uploads.length, skipped };
  } catch (error) {
    await Promise.allSettled(uploaded.map((key) => deleteObject(key)));
    throw error;
  }
}

export async function setImageColor(productId: string, imageId: string, rawColor: string | null) {
  const product = await getProduct(productId);
  const color = resolveImageColor(product, rawColor);
  const result = await productRepository.setProductImageColor(productId, imageId, color);
  if (result.count === 0) throw new AppError(404, 'PRODUCT_IMAGE_NOT_FOUND', 'Product image was not found');
  return getProduct(productId);
}

/** Fixes a misspelt colour in one step: its variants and photos move together. */
export async function renameColor(productId: string, rawFrom: string, rawTo: string) {
  const product = await getProduct(productId);
  const from = productColors(product).find((color) => nameKey(color) === nameKey(rawFrom));
  if (!from) throw new AppError(404, 'PRODUCT_COLOR_UNKNOWN', 'This product has no variant in that colour');
  const to = normalizeColour(rawTo);
  if (nameKey(from) !== nameKey(to)) {
    const targetSizes = new Set(product.variants.filter((variant) => nameKey(variant.color) === nameKey(to)).map((variant) => nameKey(variant.size)));
    const clash = product.variants.find((variant) => variant.color === from && targetSizes.has(nameKey(variant.size)));
    if (clash) {
      throw new AppError(409, 'VARIANT_ALREADY_EXISTS', `This product already has a ${to} / ${clash.size} variant, so ${from} cannot be renamed to ${to}`);
    }
  }
  await productRepository.renameProductColor(productId, from, to);
  return getProduct(productId);
}

export async function getCatalogOptions() {
  return { sizes: [...STANDARD_SIZES], colors: await productRepository.listCatalogColors() };
}

export async function removeImage(productId: string, imageId: string) {
  await getProduct(productId);
  const image = await productRepository.removeProductImage(productId, imageId);
  if (!image) throw new AppError(404, 'PRODUCT_IMAGE_NOT_FOUND', 'Product image was not found');
  if (image.objectKey) await deleteObject(image.objectKey);
}
