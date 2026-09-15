-- CreateEnum
CREATE TYPE "PreferredCalendar" AS ENUM ('AD', 'BS');

-- CreateEnum
CREATE TYPE "CustomerProfileState" AS ENUM ('active', 'legacy_unlinked', 'reconciliation_required');

-- CreateEnum
CREATE TYPE "MembershipAccrualSource" AS ENUM ('pos_sale', 'web_order');

-- CreateEnum
CREATE TYPE "EmailOutboxStatus" AS ENUM ('pending', 'queued', 'sending', 'sent', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('auth_verification', 'auth_password_reset', 'pos_receipt', 'web_order_confirmation');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customerProfileId" TEXT,
ADD COLUMN     "membershipDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "membershipTierSnapshot" JSONB,
ADD COLUMN     "merchandiseDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pos_sale_items" ADD COLUMN     "productImageUrl" TEXT;

-- AlterTable
ALTER TABLE "pos_sales" ADD COLUMN     "customerProfileId" TEXT,
ADD COLUMN     "membershipDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "membershipTierSnapshot" JSONB,
ADD COLUMN     "merchandiseDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "normalizedPhone" TEXT,
    "normalizedEmail" TEXT,
    "birthDate" DATE,
    "preferredCalendar" "PreferredCalendar",
    "bsBirthMonth" INTEGER,
    "bsBirthDay" INTEGER,
    "state" "CustomerProfileState" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "threshold" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "benefits" TEXT NOT NULL,
    "birthdayGiftDescription" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tier_versions" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "threshold" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "benefits" TEXT NOT NULL,
    "birthdayGiftDescription" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_tier_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tier_audits" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_tier_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_membership_years" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "eligibleNetSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "activeTierId" TEXT,
    "activeTierVersionId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_membership_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_accruals" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "membershipYearId" TEXT NOT NULL,
    "source" "MembershipAccrualSource" NOT NULL,
    "posSaleId" TEXT,
    "orderId" TEXT,
    "netMerchandiseAmount" DECIMAL(12,2) NOT NULL,
    "tierBeforeSnapshot" JSONB,
    "tierAfterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "payload" JSONB,
    "encryptedPayload" TEXT,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastErrorCode" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_userId_key" ON "customer_profiles"("userId");

-- CreateIndex
CREATE INDEX "customer_profiles_state_idx" ON "customer_profiles"("state");

-- CreateIndex
CREATE INDEX "customer_profiles_preferredCalendar_bsBirthMonth_bsBirthDay_idx" ON "customer_profiles"("preferredCalendar", "bsBirthMonth", "bsBirthDay");

-- CreateIndex
CREATE INDEX "customer_profiles_birthDate_idx" ON "customer_profiles"("birthDate");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_normalizedPhone_key" ON "customer_profiles"("normalizedPhone");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_normalizedEmail_key" ON "customer_profiles"("normalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_name_key" ON "membership_tiers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_rank_key" ON "membership_tiers"("rank");

-- CreateIndex
CREATE INDEX "membership_tiers_isActive_threshold_idx" ON "membership_tiers"("isActive", "threshold");

-- CreateIndex
CREATE INDEX "membership_tier_versions_tierId_createdAt_idx" ON "membership_tier_versions"("tierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tier_versions_tierId_version_key" ON "membership_tier_versions"("tierId", "version");

-- CreateIndex
CREATE INDEX "membership_tier_audits_tierId_createdAt_idx" ON "membership_tier_audits"("tierId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_membership_years_year_activeTierId_idx" ON "customer_membership_years"("year", "activeTierId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_membership_years_customerProfileId_year_key" ON "customer_membership_years"("customerProfileId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "membership_accruals_posSaleId_key" ON "membership_accruals"("posSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_accruals_orderId_key" ON "membership_accruals"("orderId");

-- CreateIndex
CREATE INDEX "membership_accruals_customerProfileId_createdAt_idx" ON "membership_accruals"("customerProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_deduplicationKey_key" ON "email_outbox"("deduplicationKey");

-- CreateIndex
CREATE INDEX "email_outbox_status_availableAt_idx" ON "email_outbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "orders_customerProfileId_idx" ON "orders"("customerProfileId");

-- CreateIndex
CREATE INDEX "pos_sales_customerProfileId_idx" ON "pos_sales"("customerProfileId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tier_versions" ADD CONSTRAINT "membership_tier_versions_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "membership_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tier_audits" ADD CONSTRAINT "membership_tier_audits_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "membership_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tier_audits" ADD CONSTRAINT "membership_tier_audits_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_membership_years" ADD CONSTRAINT "customer_membership_years_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_membership_years" ADD CONSTRAINT "customer_membership_years_activeTierVersionId_fkey" FOREIGN KEY ("activeTierVersionId") REFERENCES "membership_tier_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_accruals" ADD CONSTRAINT "membership_accruals_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_accruals" ADD CONSTRAINT "membership_accruals_membershipYearId_fkey" FOREIGN KEY ("membershipYearId") REFERENCES "customer_membership_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_accruals" ADD CONSTRAINT "membership_accruals_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "pos_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_accruals" ADD CONSTRAINT "membership_accruals_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve authenticated customer history without inferring missing phone/DOB data.
-- Guest orders and historical POS sales intentionally remain unlinked for reconciliation.
INSERT INTO "customer_profiles" ("id", "userId", "fullName", "normalizedEmail", "state", "createdAt", "updatedAt")
SELECT 'legacy_user_' || "id", "id", "name", lower(trim("email")), 'legacy_unlinked', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "role" = 'customer'
ON CONFLICT ("userId") DO NOTHING;

UPDATE "orders" AS o
SET "customerProfileId" = 'legacy_user_' || o."userId"
WHERE o."userId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "customer_profiles" AS cp WHERE cp."id" = 'legacy_user_' || o."userId");

-- Immutable initial tier terms. Admin edits create later versions and never rewrite these records.
INSERT INTO "membership_tiers" ("id", "name", "threshold", "discountPercent", "benefits", "birthdayGiftDescription", "rank", "isActive", "createdAt", "updatedAt") VALUES
  ('tier_default_gold', 'Gold', 20000.00, 10.00, 'Exclusive member benefits', 'Birthday gift', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tier_default_diamond', 'Diamond', 50000.00, 20.00, 'Exclusive member benefits; priority access to selected drops and offers', 'Premium birthday gift', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tier_default_royal_diamond', 'Royal Diamond', 100000.00, 30.00, 'Exclusive access to selected drops and special benefits', 'Exclusive premium birthday gift and high-value premium-material gift', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "membership_tier_versions" ("id", "tierId", "version", "name", "threshold", "discountPercent", "benefits", "birthdayGiftDescription", "rank", "isActive")
SELECT 'tier_version_1_' || "id", "id", 1, "name", "threshold", "discountPercent", "benefits", "birthdayGiftDescription", "rank", "isActive"
FROM "membership_tiers"
WHERE "id" IN ('tier_default_gold', 'tier_default_diamond', 'tier_default_royal_diamond')
ON CONFLICT ("tierId", "version") DO NOTHING;
