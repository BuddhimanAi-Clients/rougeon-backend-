import { Prisma, type MembershipAccrualSource } from '@prisma/client';
import { membershipYear } from '../calendar/calendar.service.js';
import { AppError } from '../errors/app-error.js';

type Transaction = Prisma.TransactionClient;
type TierVersion = { id: string; tierId: string; version: number; name: string; threshold: Prisma.Decimal; discountPercent: Prisma.Decimal; benefits: string; birthdayGiftDescription: string; rank: number; isActive: boolean };

export type MembershipQuote = { year: number; membershipYearId: string; tier: TierVersion | null; discountPercent: Prisma.Decimal; eligibleNetSpend: Prisma.Decimal };

function snapshot(tier: TierVersion | null): Prisma.JsonObject | null {
  return tier ? { tierId: tier.tierId, versionId: tier.id, version: tier.version, name: tier.name, threshold: tier.threshold.toFixed(2), discountPercent: tier.discountPercent.toFixed(2), benefits: tier.benefits, birthdayGiftDescription: tier.birthdayGiftDescription, rank: tier.rank } : null;
}

async function lockCustomerYear(transaction: Transaction, customerProfileId: string, year: number) {
  // pg_advisory_xact_lock returns PostgreSQL's void type. $queryRaw attempts to
  // deserialize that return value, while $executeRaw correctly ignores it.
  await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`membership:${customerProfileId}:${year}`}, 0))`);
}

async function currentYear(transaction: Transaction, customerProfileId: string, year: number) {
  await lockCustomerYear(transaction, customerProfileId, year);
  await transaction.customerMembershipYear.upsert({ where: { customerProfileId_year: { customerProfileId, year } }, create: { customerProfileId, year }, update: {} });
  await transaction.$executeRaw(Prisma.sql`SELECT "id" FROM "customer_membership_years" WHERE "customerProfileId" = ${customerProfileId} AND "year" = ${year} FOR UPDATE`);
  return transaction.customerMembershipYear.findUniqueOrThrow({ where: { customerProfileId_year: { customerProfileId, year } }, include: { activeTierVersion: true } });
}

export async function quoteMembership(transaction: Transaction, customerProfileId: string, now = new Date()): Promise<MembershipQuote> {
  const year = membershipYear(now);
  const record = await currentYear(transaction, customerProfileId, year);
  return { year, membershipYearId: record.id, tier: record.activeTierVersion as TierVersion | null, discountPercent: record.activeTierVersion?.discountPercent ?? new Prisma.Decimal(0), eligibleNetSpend: record.eligibleNetSpend };
}

export async function accrueMembership(input: { transaction: Transaction; customerProfileId: string; source: MembershipAccrualSource; posSaleId?: string; orderId?: string; netMerchandiseAmount: Prisma.Decimal; now?: Date }) {
  const { transaction, customerProfileId, source, posSaleId, orderId, netMerchandiseAmount } = input;
  if (netMerchandiseAmount.isNegative()) throw new AppError(422, 'INVALID_MEMBERSHIP_AMOUNT', 'Membership amount cannot be negative');
  const year = membershipYear(input.now);
  const existing = posSaleId ? await transaction.membershipAccrual.findUnique({ where: { posSaleId } }) : orderId ? await transaction.membershipAccrual.findUnique({ where: { orderId } }) : null;
  if (existing) return { replayed: true, newlyUnlocked: null as TierVersion | null, membership: await quoteMembership(transaction, customerProfileId, input.now) };
  const record = await currentYear(transaction, customerProfileId, year);
  const before = record.activeTierVersion as TierVersion | null;
  const newSpend = record.eligibleNetSpend.plus(netMerchandiseAmount);
  const candidate = await transaction.membershipTier.findFirst({
    where: { isActive: true, threshold: { lte: newSpend } },
    orderBy: [{ rank: 'desc' }],
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  const candidateVersion = candidate?.versions[0] as TierVersion | undefined;
  const upgraded = candidateVersion && (!before || candidateVersion.rank > before.rank) ? candidateVersion : null;
  const updated = await transaction.customerMembershipYear.update({
    where: { id: record.id },
    data: { eligibleNetSpend: newSpend, ...(upgraded ? { activeTierId: upgraded.tierId, activeTierVersionId: upgraded.id, activatedAt: input.now ?? new Date() } : {}) },
    include: { activeTierVersion: true },
  });
  await transaction.membershipAccrual.create({ data: { customerProfileId, membershipYearId: record.id, source, ...(posSaleId ? { posSaleId } : {}), ...(orderId ? { orderId } : {}), netMerchandiseAmount, tierBeforeSnapshot: snapshot(before) ?? Prisma.JsonNull, tierAfterSnapshot: snapshot(updated.activeTierVersion as TierVersion | null) ?? Prisma.JsonNull } });
  return { replayed: false, newlyUnlocked: upgraded, membership: { year, membershipYearId: updated.id, tier: updated.activeTierVersion as TierVersion | null, discountPercent: updated.activeTierVersion?.discountPercent ?? new Prisma.Decimal(0), eligibleNetSpend: updated.eligibleNetSpend } satisfies MembershipQuote };
}

export function membershipSnapshot(tier: TierVersion | null) { return snapshot(tier); }
