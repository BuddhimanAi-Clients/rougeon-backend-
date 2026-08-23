import { prisma } from '../../configs/database.config.js';

export function listCategories() {
  return prisma.category.findMany({
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}
