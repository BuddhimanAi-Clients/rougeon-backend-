-- How the customer chose to receive the parcel at checkout: delivered home
-- (Door2Door) or collected from the Nepal Can Move branch (Door2Branch).
-- Orders placed before the choice existed were all home delivery.
ALTER TABLE "orders" ADD COLUMN "shippingDeliveryType" TEXT NOT NULL DEFAULT 'Door2Door';
