-- Product photos can belong to one colour of a product. Photos without a
-- colour are general and show for every colour.
ALTER TABLE "product_images"
  ADD COLUMN "color" TEXT,
  ADD COLUMN "sourceName" TEXT;

CREATE INDEX "product_images_productId_color_idx" ON "product_images"("productId", "color");

-- Sizes are stored in capitals and colours in Title Case from now on, so
-- "m"/"M" and "grey"/"Grey" can no longer become separate values.
UPDATE "product_variants" SET "size" = UPPER(BTRIM("size")) WHERE "size" <> UPPER(BTRIM("size"));
UPDATE "product_variants" SET "color" = INITCAP(BTRIM("color")) WHERE "color" <> INITCAP(BTRIM("color"));

-- One row per bulk import, kept as an audit trail of who loaded what.
CREATE TABLE "product_imports" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "product_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_imports_createdAt_idx" ON "product_imports"("createdAt");

ALTER TABLE "product_imports" ADD CONSTRAINT "product_imports_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
