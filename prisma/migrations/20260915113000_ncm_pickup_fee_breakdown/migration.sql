-- Preserve historic shipping totals as delivery charges. New checkout orders
-- snapshot both the carrier delivery charge and the fixed NCM pickup charge.
ALTER TABLE "orders"
  ADD COLUMN "shippingDeliveryFee" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "shippingPickupFee" DECIMAL(12, 2) NOT NULL DEFAULT 0;

UPDATE "orders"
SET "shippingDeliveryFee" = "shippingFee";
