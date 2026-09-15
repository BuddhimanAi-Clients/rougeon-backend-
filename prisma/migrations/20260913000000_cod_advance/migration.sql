ALTER TYPE "WebPaymentMethod" ADD VALUE IF NOT EXISTS 'cod';

ALTER TABLE "orders"
  ADD COLUMN "advancePaymentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "codCollectionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "codMerchandiseAdvancePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "payment_qr_configurations"
  ADD COLUMN "codMerchandiseAdvancePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
