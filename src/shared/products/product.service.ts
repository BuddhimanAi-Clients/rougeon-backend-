import type { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { paginatedResult } from '../http/pagination.js';
import * as productRepository from './product.repository.js';
import type { PublicProductListQuery } from './product.schemas.js';

type PublicProductRecord = Awaited<
  ReturnType<typeof productRepository.findPublicProductBySlug>
>;

function imageUrls(images: Prisma.JsonValue) {
  return Array.isArray(images)
    ? images.filter((image): image is string => typeof image === 'string')
    : [];
}

export function toPublicProduct(product: NonNullable<PublicProductRecord>) {
  const variants = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    price: variant.price.toFixed(2),
    available: variant.stockQty > 0,
  }));
  const prices = product.variants.map((variant) => variant.price);
  const firstPrice = prices[0];
  const minimumPrice = firstPrice
    ? prices.slice(1).reduce(
        (minimum, price) => (price.lessThan(minimum) ? price : minimum),
        firstPrice,
      )
    : undefined;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    images: imageUrls(product.images),
    createdAt: product.createdAt,
    category: product.category,
    variants,
    minPrice: minimumPrice?.toFixed(2) ?? null,
    available: variants.some((variant) => variant.available),
  };
}

export async function getPublicProducts(query: PublicProductListQuery) {
  const { products, total } = await productRepository.listPublicProducts(query);
  return paginatedResult(products.map(toPublicProduct), total, query);
}

export async function getPublicProduct(slug: string) {
  const product = await productRepository.findPublicProductBySlug(slug);
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  }
  return toPublicProduct(product);
}
