CREATE TYPE "ShipmentCarrier" AS ENUM ('nepal_can_move');
CREATE TYPE "ShipmentBookingStatus" AS ENUM ('pending', 'booked', 'failed');

ALTER TYPE "EmailKind" ADD VALUE IF NOT EXISTS 'web_payment_receipt';
ALTER TYPE "EmailKind" ADD VALUE IF NOT EXISTS 'web_delivery_receipt';
ALTER TABLE "orders" ADD COLUMN "guestEmail" TEXT;

CREATE TABLE "shipments" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "carrier" "ShipmentCarrier" NOT NULL DEFAULT 'nepal_can_move',
  "carrierOrderId" TEXT,
  "bookingStatus" "ShipmentBookingStatus" NOT NULL DEFAULT 'pending',
  "pickupBranch" TEXT NOT NULL,
  "destinationBranch" TEXT NOT NULL,
  "deliveryType" TEXT NOT NULL DEFAULT 'Door2Door',
  "packageDescription" TEXT,
  "weightGrams" INTEGER,
  "carrierCharge" DECIMAL(12,2),
  "collectionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "carrierStatus" TEXT,
  "carrierStatusAt" TIMESTAMP(3),
  "bookingError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipment_events" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payloadHash" TEXT NOT NULL,
  "rawPayload" JSONB NOT NULL,
  "isTest" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shipments_orderId_key" ON "shipments"("orderId");
CREATE UNIQUE INDEX "shipments_carrierOrderId_key" ON "shipments"("carrierOrderId");
CREATE INDEX "shipments_bookingStatus_idx" ON "shipments"("bookingStatus");
CREATE INDEX "shipments_carrierStatusAt_idx" ON "shipments"("carrierStatusAt");
CREATE UNIQUE INDEX "shipment_events_shipmentId_payloadHash_key" ON "shipment_events"("shipmentId", "payloadHash");
CREATE INDEX "shipment_events_shipmentId_occurredAt_idx" ON "shipment_events"("shipmentId", "occurredAt");

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
