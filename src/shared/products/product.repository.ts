import { Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import type { PublicProductListQuery } from './product.schemas.js';

type ProductIdRow = { id: string };
type CountRow = { count: number };

function publicProductConditions(query: PublicProductListQuery) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."status" = ${ProductStatus.active}::"ProductStatus"`,
  ];

  if (query.categoryId) {
    conditions.push(Prisma.sql`p."categoryId" = ${query.categoryId}`);
  }
  if (query.categorySlug) {
    conditions.push(Prisma.sql`c."slug" = ${query.categorySlug}`);
  }
  if (query.search) {
    const search = `%${query.search}%`;
    conditions.push(
      Prisma.sql`(p."name" ILIKE ${search} OR v."sku" ILIKE ${search})`,
    );
  }
  if (query.minPrice !== undefined) {
    conditions.push(
      Prisma.sql`v."price" >= ${new Prisma.Decimal(query.minPrice)}`,
    );
  }
  if (query.maxPrice !== undefined) {
    conditions.push(
      Prisma.sql`v."price" <= ${new Prisma.Decimal(query.maxPrice)}`,
    );
  }

  return Prisma.join(conditions, ' AND ');
}

function publicProductOrder(query: PublicProductListQuery) {
  // Keep products with at least one buyable variant ahead of sold-out products
  // across every catalogue sort and page.  The secondary sort remains the
  // customer-selected one, so this is stable and database-side.
  const availability = Prisma.sql`MAX(CASE WHEN v."stockQty" > 0 THEN 1 ELSE 0 END) DESC`;
  if (query.sort === 'price_asc') {
    return Prisma.sql`${availability}, MIN(v."price") ASC, p."id" ASC`;
  }
  if (query.sort === 'price_desc') {
    return Prisma.sql`${availability}, MIN(v."price") DESC, p."id" ASC`;
  }
  return Prisma.sql`${availability}, p."createdAt" DESC, p."id" ASC`;
}

export async function listPublicProducts(query: PublicProductListQuery) {
  const conditions = publicProductConditions(query);
  const order = publicProductOrder(query);
  const offset = (query.page - 1) * query.limit;

  const [idRows, countRows] = await prisma.$transaction([
    prisma.$queryRaw<ProductIdRow[]>(Prisma.sql`
      SELECT p."id"
      FROM "products" AS p
      JOIN "categories" AS c ON c."id" = p."categoryId"
      JOIN "product_variants" AS v ON v."productId" = p."id"
      WHERE ${conditions}
      GROUP BY p."id", p."createdAt"
      ORDER BY ${order}
      LIMIT ${query.limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT p."id")::int AS "count"
      FROM "products" AS p
      JOIN "categories" AS c ON c."id" = p."categoryId"
      JOIN "product_variants" AS v ON v."productId" = p."id"
      WHERE ${conditions}
    `),
  ]);

  const productIds = idRows.map((row) => row.id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: ProductStatus.active },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { orderBy: [{ sku: 'asc' }, { id: 'asc' }] },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return {
    products: productIds.flatMap((id) => {
      const product = byId.get(id);
      return product ? [product] : [];
    }),
    total: countRows[0]?.count ?? 0,
  };
}

export function findPublicProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { slug, status: ProductStatus.active },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { orderBy: [{ sku: 'asc' }, { id: 'asc' }] },
    },
  });
}
