-- R2-backed media metadata. Existing Product.images JSON remains intact for
-- backwards-compatible API responses and is backfilled as legacy media rows.
CREATE TYPE "PaymentQrConfigurationEventType" AS ENUM ('activated', 'deactivated');

CREATE TABLE "product_images" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "objectKey" TEXT,
  "publicUrl" TEXT NOT NULL,
  "detectedMimeType" TEXT,
  "byteSize" INTEGER,
  "sortOrder" INTEGER NOT NULL,
  "isLegacy" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

INSERT INTO "product_images" ("id", "productId", "publicUrl", "sortOrder", "isLegacy")
SELECT
  'legacy_' || p."id" || '_' || image.ordinality::text,
  p."id",
  image.value #>> '{}',
  image.ordinality - 1,
  true
FROM "products" p
CROSS JOIN LATERAL jsonb_array_elements(p."images") WITH ORDINALITY AS image(value, ordinality)
WHERE jsonb_typeof(p."images") = 'array'
  AND jsonb_typeof(image.value) = 'string';

CREATE UNIQUE INDEX "product_images_objectKey_key" ON "product_images"("objectKey");
CREATE UNIQUE INDEX "product_images_productId_sortOrder_key" ON "product_images"("productId", "sortOrder");
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD COLUMN "screenshotObjectKey" TEXT,
  ADD COLUMN "screenshotMimeType" TEXT,
  ADD COLUMN "screenshotSize" INTEGER,
  ADD COLUMN "qrConfigurationId" TEXT;
CREATE UNIQUE INDEX "payments_screenshotObjectKey_key" ON "payments"("screenshotObjectKey");
CREATE INDEX "payments_qrConfigurationId_idx" ON "payments"("qrConfigurationId");

CREATE TABLE "payment_qr_configurations" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "publicUrl" TEXT NOT NULL,
  "detectedMimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "providerName" TEXT,
  "accountName" TEXT,
  "accountIdentifier" TEXT,
  "instructions" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "uploadedById" TEXT NOT NULL,
  "activatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "payment_qr_configurations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_qr_configurations_objectKey_key" ON "payment_qr_configurations"("objectKey");
CREATE INDEX "payment_qr_configurations_isActive_idx" ON "payment_qr_configurations"("isActive");
CREATE INDEX "payment_qr_configurations_createdAt_idx" ON "payment_qr_configurations"("createdAt");
CREATE UNIQUE INDEX "payment_qr_configurations_one_active_key"
  ON "payment_qr_configurations" (("isActive")) WHERE "isActive" = true;

CREATE TABLE "payment_qr_configuration_events" (
  "id" TEXT NOT NULL,
  "configurationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" "PaymentQrConfigurationEventType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_qr_configuration_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_qr_configuration_events_configurationId_createdAt_idx"
  ON "payment_qr_configuration_events"("configurationId", "createdAt");

ALTER TABLE "payments" ADD CONSTRAINT "payments_qrConfigurationId_fkey"
  FOREIGN KEY ("qrConfigurationId") REFERENCES "payment_qr_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_qr_configurations" ADD CONSTRAINT "payment_qr_configurations_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_qr_configurations" ADD CONSTRAINT "payment_qr_configurations_activatedById_fkey"
  FOREIGN KEY ("activatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_qr_configuration_events" ADD CONSTRAINT "payment_qr_configuration_events_configurationId_fkey"
  FOREIGN KEY ("configurationId") REFERENCES "payment_qr_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_qr_configuration_events" ADD CONSTRAINT "payment_qr_configuration_events_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
