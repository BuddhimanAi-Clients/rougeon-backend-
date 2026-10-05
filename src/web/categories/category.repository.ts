import { prisma } from '../../configs/database.config.js';

export function listCategories() {
  return prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true, imageUrl: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}
