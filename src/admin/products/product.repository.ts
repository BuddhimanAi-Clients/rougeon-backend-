import { Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { paginationArgs } from '../../shared/http/pagination.js';
import type { CreateProductBody, ListProductsQuery, UpdateProductBody } from './product.schemas.js';

function productWhere(query: ListProductsQuery): Prisma.ProductWhereInput {
  return {
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { slug: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

export function findCategory(id: string) {
  return prisma.category.findUnique({ where: { id }, select: { id: true } });
}

export function createProduct(input: CreateProductBody) {
  return prisma.product.create({ data: input, include: { category: true, variants: true, media: { orderBy: { sortOrder: 'asc' } } } });
}

export async function listProducts(query: ListProductsQuery) {
  const where = productWhere(query);
  return prisma.$transaction([
    prisma.product.findMany({
      where,
    include: { category: true, media: { orderBy: { sortOrder: 'asc' } }, _count: { select: { variants: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...paginationArgs(query),
    }),
    prisma.product.count({ where }),
  ]);
}

export function findProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { category: true, media: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: [{ sku: 'asc' }, { id: 'asc' }] } },
  });
}

export function updateProduct(id: string, input: UpdateProductBody) {
  const data: Prisma.ProductUncheckedUpdateInput = {};
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.images !== undefined) data.images = input.images;
  if (input.status !== undefined) data.status = input.status;
  return prisma.product.update({
    where: { id },
    data,
    include: { category: true, media: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { sku: 'asc' } } },
  });
}

export function archiveProduct(id: string) {
  return prisma.product.update({
    where: { id },
    data: { status: ProductStatus.archived },
    include: { category: true, media: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { sku: 'asc' } } },
  });
}

export function findProductImage(productId: string, imageId: string) {
  return prisma.productImage.findFirst({ where: { id: imageId, productId } });
}

export function addProductImages(productId: string, images: Array<{ objectKey: string; publicUrl: string; detectedMimeType: string; byteSize: number; sortOrder: number }>) {
  return prisma.$transaction(async (transaction) => {
    await transaction.productImage.createMany({ data: images.map((image) => ({ ...image, productId })) });
    const all = await transaction.productImage.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' } });
    return transaction.product.update({ where: { id: productId }, data: { images: all.map((image) => image.publicUrl) }, include: { category: true, media: { orderBy: { sortOrder: 'asc' } }, variants: true } });
  });
}

export function removeProductImage(productId: string, imageId: string) {
  return prisma.$transaction(async (transaction) => {
    const image = await transaction.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) return null;
    await transaction.productImage.delete({ where: { id: image.id } });
    const all = await transaction.productImage.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' } });
    await transaction.product.update({ where: { id: productId }, data: { images: all.map((item) => item.publicUrl) } });
    return image;
  });
}
