import { AppError } from '../../shared/errors/app-error.js';
import { prisma } from '../../configs/database.config.js';
import { membershipYear } from '../../shared/calendar/calendar.service.js';
import * as identity from '../../shared/customers/customer.service.js';
import * as repository from './customer.repository.js';
import type { CustomerProfileInput } from '../../shared/customers/customer.schemas.js';

export async function getMine(userId: string) {
  const resolved = await identity.resolveVerifiedMembershipSignup(userId);
  if ('complete' in resolved) return resolved;
  const profile = await prisma.customerProfile.findUnique({
    where: { id: resolved.id },
    include: { membershipYears: { where: { year: membershipYear() }, include: { activeTierVersion: true } } },
  });
  if (!profile) return resolved;
  const current = profile.membershipYears[0];
  const next = await prisma.membershipTier.findFirst({
    where: { isActive: true, threshold: { gt: current?.eligibleNetSpend ?? 0 } },
    orderBy: { threshold: 'asc' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  return {
    ...profile,
    membership: {
      eligibleNetSpend: (current?.eligibleNetSpend ?? 0).toFixed(2),
      tier: current?.activeTierVersion ? { name: current.activeTierVersion.name, discountPercent: current.activeTierVersion.discountPercent.toFixed(2), activatedAt: current.activatedAt } : null,
      nextTier: next?.versions[0] ? { name: next.versions[0].name, remaining: next.threshold.minus(current?.eligibleNetSpend ?? 0).toFixed(2) } : null,
    },
  };
}
export async function saveMembershipSignup(userId: string, input: CustomerProfileInput) {
  await identity.saveMembershipSignupClaim(userId, input);
  return identity.resolveVerifiedMembershipSignup(userId);
}
export async function saveMine(userId: string, input: CustomerProfileInput) {
  const user = await repository.findUser(userId);
  if (!user || !user.emailVerified) throw new AppError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email before linking membership');
  if (identity.normalizeEmail(user.email) !== identity.normalizeEmail(input.email)) throw new AppError(422, 'PROFILE_EMAIL_MISMATCH', 'Use the verified email on your Website account');
  if (await repository.findByUserId(userId)) return identity.ensureUserProfile(userId, input);
  await identity.saveMembershipSignupClaim(userId, input);
  const resolved = await identity.resolveVerifiedMembershipSignup(userId);
  if ('complete' in resolved) throw new AppError(409, 'CUSTOMER_IDENTITY_CONFLICT', 'The phone and email cannot be safely matched to one membership profile');
  return resolved;
}
