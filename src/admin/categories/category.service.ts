import type { Category } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import type { CreateCategoryBody, UpdateCategoryBody } from './category.schemas.js';
import * as categoryRepository from './category.repository.js';

type CategoryTree = Category & { children: CategoryTree[] };

async function requireParent(parentId: string | null | undefined) {
  if (parentId && !(await categoryRepository.findCategory(parentId))) {
    throw new AppError(404, 'PARENT_CATEGORY_NOT_FOUND', 'Parent category was not found');
  }
}

export async function createCategory(input: CreateCategoryBody) {
  await requireParent(input.parentId);
  return categoryRepository.createCategory(input);
}

export async function getCategoryTree(): Promise<CategoryTree[]> {
  const categories = await categoryRepository.listCategories();
  const byId = new Map<string, CategoryTree>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryTree[] = [];
  for (const category of categories) {
    const node = byId.get(category.id)!;
    const parent = category.parentId ? byId.get(category.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function updateCategory(id: string, input: UpdateCategoryBody) {
  const category = await categoryRepository.findCategory(id);
  if (!category) {
    throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category was not found');
  }
  if (input.parentId === id) {
    throw new AppError(409, 'CATEGORY_CYCLE', 'A category cannot be its own parent');
  }
  await requireParent(input.parentId);

  if (input.parentId) {
    const categories = await categoryRepository.listCategories();
    const parentById = new Map(categories.map((item) => [item.id, item.parentId]));
    let current: string | null | undefined = input.parentId;
    const visited = new Set<string>();
    while (current) {
      if (current === id) {
        throw new AppError(409, 'CATEGORY_CYCLE', 'Category hierarchy cannot contain a cycle');
      }
      if (visited.has(current)) {
        throw new AppError(409, 'CATEGORY_CYCLE', 'Category hierarchy already contains a cycle');
      }
      visited.add(current);
      current = parentById.get(current);
    }
  }

  return categoryRepository.updateCategory(id, input);
}

export async function deleteCategory(id: string) {
  if (!(await categoryRepository.findCategory(id))) {
    throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category was not found');
  }
  const references = await categoryRepository.categoryReferences(id);
  if (references.children > 0 || references.products > 0) {
    throw new AppError(
      409,
      'CATEGORY_IN_USE',
      'Category with child categories or products cannot be deleted',
    );
  }
  await categoryRepository.deleteCategory(id);
}
