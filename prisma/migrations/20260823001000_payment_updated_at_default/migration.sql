-- Align the database default with Prisma's @updatedAt behavior.
ALTER TABLE "payments" ALTER COLUMN "updatedAt" DROP DEFAULT;
