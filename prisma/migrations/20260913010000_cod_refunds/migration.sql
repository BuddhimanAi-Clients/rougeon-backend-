CREATE TYPE "RefundStatus" AS ENUM ('pending', 'completed');

ALTER TABLE "orders"
  ADD COLUMN "refundStatus" "RefundStatus",
  ADD COLUMN "refundAmount" DECIMAL(12,2),
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "refundRequestedAt" TIMESTAMP(3),
  ADD COLUMN "refundCompletedAt" TIMESTAMP(3),
  ADD COLUMN "refundReference" TEXT;
