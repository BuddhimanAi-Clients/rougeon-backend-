-- Nepal Can Move delivery area chosen by the customer. Drives the live
-- delivery fee at checkout and prefills courier booking for Admin.
ALTER TABLE "addresses" ADD COLUMN "ncmBranch" TEXT;
ALTER TABLE "orders" ADD COLUMN "shippingBranch" TEXT;
