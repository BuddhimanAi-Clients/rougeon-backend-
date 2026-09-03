-- Add retry safety, review state, and immutable receipt snapshots to POS sales.
ALTER TABLE "pos_sales"
ADD COLUMN "clientSaleId" TEXT,
ADD COLUMN "cashierName" TEXT,
ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- Backfill the cashier name for existing historical sales.
UPDATE "pos_sales" AS ps
SET "cashierName" = u."name"
FROM "users" AS u
WHERE ps."staffId" = u."id";

ALTER TABLE "pos_sales"
ALTER COLUMN "cashierName" SET NOT NULL;

ALTER TABLE "pos_sale_items"
ADD COLUMN "productName" TEXT,
ADD COLUMN "variantSku" TEXT,
ADD COLUMN "variantSize" TEXT,
ADD COLUMN "variantColor" TEXT;

-- Backfill the best available catalog values for existing historical sale items.
UPDATE "pos_sale_items" AS psi
SET
  "productName" = p."name",
  "variantSku" = pv."sku",
  "variantSize" = pv."size",
  "variantColor" = pv."color"
FROM "product_variants" AS pv
JOIN "products" AS p ON p."id" = pv."productId"
WHERE psi."variantId" = pv."id";

ALTER TABLE "pos_sale_items"
ALTER COLUMN "productName" SET NOT NULL,
ALTER COLUMN "variantSku" SET NOT NULL,
ALTER COLUMN "variantSize" SET NOT NULL,
ALTER COLUMN "variantColor" SET NOT NULL;

CREATE UNIQUE INDEX "pos_sales_staffId_clientSaleId_key"
ON "pos_sales"("staffId", "clientSaleId");

CREATE INDEX "pos_sales_needsReview_idx"
ON "pos_sales"("needsReview");
