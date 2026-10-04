-- Admin-controlled membership discount eligibility per product. Existing
-- products keep today's behaviour (eligible).
ALTER TABLE "products"
  ADD COLUMN "membershipDiscountEligible" BOOLEAN NOT NULL DEFAULT true;

-- Per-line discount snapshots so receipts and emails can itemise the bill.
ALTER TABLE "order_items"
  ADD COLUMN "membershipDiscountEligible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "discountAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE "pos_sale_items"
  ADD COLUMN "membershipDiscountEligible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "discountAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Audit trail for a cashier withholding a discount the customer qualified for.
ALTER TABLE "pos_sales"
  ADD COLUMN "membershipDiscountWaived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "membershipDiscountWaivedPercent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "membershipDiscountWaivedAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "membershipDiscountWaivedReason" TEXT;

CREATE INDEX "pos_sales_membershipDiscountWaived_idx" ON "pos_sales"("membershipDiscountWaived");

-- Historic sales applied the tier percentage to every line. Backfill the
-- per-line snapshot from the stored percentage; order/sale totals are untouched.
UPDATE "order_items" AS i
SET "discountAmount" = ROUND(i."price" * i."qty" * o."membershipDiscountPercent" / 100, 2)
FROM "orders" AS o
WHERE o."id" = i."orderId" AND o."membershipDiscountPercent" > 0;

UPDATE "pos_sale_items" AS i
SET "discountAmount" = ROUND(i."price" * i."qty" * s."membershipDiscountPercent" / 100, 2)
FROM "pos_sales" AS s
WHERE s."id" = i."saleId" AND s."membershipDiscountPercent" > 0;
