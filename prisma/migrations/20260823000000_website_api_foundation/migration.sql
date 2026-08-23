-- AddEnumValue
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'awaiting_proof' BEFORE 'pending_verification';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "guestSessionId" TEXT;

-- AlterTable: add snapshot columns as nullable so existing rows can be backfilled safely
ALTER TABLE "order_items"
ADD COLUMN "productName" TEXT,
ADD COLUMN "productImageUrl" TEXT,
ADD COLUMN "variantSku" TEXT,
ADD COLUMN "variantSize" TEXT,
ADD COLUMN "variantColor" TEXT;

-- Backfill the best available display values for existing historical rows
UPDATE "order_items" AS oi
SET
  "productName" = p."name",
  "productImageUrl" = CASE
    WHEN jsonb_typeof(p."images") = 'array'
      AND jsonb_array_length(p."images") > 0
      AND jsonb_typeof(p."images" -> 0) = 'string'
    THEN p."images" ->> 0
    ELSE NULL
  END,
  "variantSku" = pv."sku",
  "variantSize" = pv."size",
  "variantColor" = pv."color"
FROM "product_variants" AS pv
JOIN "products" AS p ON p."id" = pv."productId"
WHERE oi."variantId" = pv."id";

ALTER TABLE "order_items"
ALTER COLUMN "productName" SET NOT NULL,
ALTER COLUMN "variantSku" SET NOT NULL,
ALTER COLUMN "variantSize" SET NOT NULL,
ALTER COLUMN "variantColor" SET NOT NULL;

-- AlterTable: existing rows receive the migration timestamp as their best available timestamp
ALTER TABLE "payments"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "orders_guestSessionId_idx" ON "orders"("guestSessionId");

-- Enforce exactly one Cart owner. Existing unique indexes already enforce one Cart per owner.
ALTER TABLE "carts"
ADD CONSTRAINT "carts_exactly_one_owner_check"
CHECK (num_nonnulls("userId", "sessionId") = 1);
