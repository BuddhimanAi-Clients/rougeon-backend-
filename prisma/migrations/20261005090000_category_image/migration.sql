-- Optional Admin-managed storefront image per category.
ALTER TABLE "categories"
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "imageObjectKey" TEXT;

CREATE UNIQUE INDEX "categories_imageObjectKey_key" ON "categories"("imageObjectKey");
