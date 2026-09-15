CREATE TYPE "MembershipSignupStatus" AS ENUM ('pending_verification', 'linked', 'conflict');

CREATE TABLE "membership_signup_claims" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "normalizedPhone" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "birthDate" DATE NOT NULL,
  "preferredCalendar" "PreferredCalendar" NOT NULL,
  "bsBirthMonth" INTEGER,
  "bsBirthDay" INTEGER,
  "status" "MembershipSignupStatus" NOT NULL DEFAULT 'pending_verification',
  "conflictReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "membership_signup_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_signup_claims_userId_key" ON "membership_signup_claims"("userId");
CREATE INDEX "membership_signup_claims_status_idx" ON "membership_signup_claims"("status");
ALTER TABLE "membership_signup_claims" ADD CONSTRAINT "membership_signup_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
