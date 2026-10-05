-- A POS sale can be paid partly in cash and partly by QR. Both amounts live on
-- the sale itself, so the two payments are always tied to one sale.
ALTER TYPE "PosPaymentMethod" ADD VALUE IF NOT EXISTS 'split';

ALTER TABLE "pos_sales"
  ADD COLUMN "cashAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "qrAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Existing sales were paid in full by a single method.
UPDATE "pos_sales" SET "cashAmount" = "total" WHERE "paymentMethod"::text = 'cash';
UPDATE "pos_sales" SET "qrAmount" = "total" WHERE "paymentMethod"::text = 'qr';
