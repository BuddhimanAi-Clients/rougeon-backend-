import type { Category } from '@prisma/client';
import * as categoryRepository from './category.repository.js';

type PublicCategory = Pick<Category, 'id' | 'name' | 'slug' | 'parentId'> & {
  children: PublicCategory[];
};

export async function getCategoryTree() {
  const categories = await categoryRepository.listCategories();
  const byId = new Map<string, PublicCategory>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: PublicCategory[] = [];

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
