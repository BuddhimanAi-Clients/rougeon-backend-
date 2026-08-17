import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import type { CreateCategoryBody, UpdateCategoryBody } from './category.schemas.js';

export function createCategory(data: CreateCategoryBody) {
  const createData: Prisma.CategoryUncheckedCreateInput = {
    name: data.name,
    slug: data.slug,
  };
  if (data.parentId !== undefined) createData.parentId = data.parentId;
  return prisma.category.create({ data: createData });
}

export function listCategories() {
  return prisma.category.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
}

export function findCategory(id: string) {
  return prisma.category.findUnique({ where: { id } });
}

export function updateCategory(id: string, data: UpdateCategoryBody) {
  const updateData: Prisma.CategoryUncheckedUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.slug !== undefined) updateData.slug = data.slug;
  if (data.parentId !== undefined) updateData.parentId = data.parentId;
  return prisma.category.update({ where: { id }, data: updateData });
}

export async function categoryReferences(id: string) {
  const [children, products] = await prisma.$transaction([
    prisma.category.count({ where: { parentId: id } }),
    prisma.product.count({ where: { categoryId: id } }),
  ]);
  return { children, products };
}

export function deleteCategory(id: string) {
  return prisma.category.delete({ where: { id } });
}
