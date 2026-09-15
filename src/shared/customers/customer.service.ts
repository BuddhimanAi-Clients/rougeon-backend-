import { Prisma, PreferredCalendar, CustomerProfileState, MembershipSignupStatus } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { prisma } from '../../configs/database.config.js';
import { bsToAd, parseAdDate } from '../calendar/calendar.service.js';
import type { CustomerProfileInput } from './customer.schemas.js';
import * as repository from './customer.repository.js';

export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }

export function normalizeNepalPhone(phone: string) {
  const compact = phone.trim().replace(/[\s().-]/g, '');
  const local = compact.startsWith('+977') ? compact.slice(4) : compact.startsWith('977') && compact.length === 13 ? compact.slice(3) : compact;
  if (!/^9\d{9}$/.test(local)) throw new AppError(422, 'INVALID_PHONE', 'Enter a valid Nepal mobile number');
  return `+977${local}`;
}

function resolvedDob(input: CustomerProfileInput) {
  if (input.dobCalendar === 'AD') return { birthDate: parseAdDate(input.dob), preferredCalendar: PreferredCalendar.AD, bsBirthMonth: null, bsBirthDay: null };
  const converted = bsToAd(input.dob);
  return { birthDate: converted.date, preferredCalendar: PreferredCalendar.BS, bsBirthMonth: converted.bsMonth, bsBirthDay: converted.bsDay };
}

export async function createPosCustomer(input: CustomerProfileInput, transaction?: Prisma.TransactionClient) {
  const normalizedPhone = normalizeNepalPhone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);
  const client = transaction ?? undefined;
  const profiles = await (client ? client.customerProfile.findMany({ where: { OR: [{ normalizedPhone }, { normalizedEmail }] } }) : repository.findByPhoneOrEmail(normalizedPhone, normalizedEmail));
  const phoneMatch = profiles.find((profile) => profile.normalizedPhone === normalizedPhone);
  const emailMatch = profiles.find((profile) => profile.normalizedEmail === normalizedEmail);
  if (phoneMatch && emailMatch && phoneMatch.id !== emailMatch.id) throw new AppError(409, 'CUSTOMER_IDENTITY_CONFLICT', 'Phone and email belong to different customer profiles');
  if (phoneMatch || emailMatch) throw new AppError(409, 'CUSTOMER_ALREADY_EXISTS', 'A customer with this phone or email already exists');
  const dob = resolvedDob(input);
  const data = { fullName: input.fullName, normalizedPhone, normalizedEmail, ...dob, state: CustomerProfileState.active } satisfies Prisma.CustomerProfileUncheckedCreateInput;
  if (client) return repository.create(client, data);
  return prisma.$transaction((tx) => repository.create(tx, data));
}

export async function ensureUserProfile(userId: string, input: CustomerProfileInput) {
  const normalizedPhone = normalizeNepalPhone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.customerProfile.findUnique({ where: { userId } });
    const conflicts = await transaction.customerProfile.findMany({ where: { OR: [{ normalizedPhone }, { normalizedEmail }] } });
    const other = conflicts.find((candidate) => candidate.id !== profile?.id);
    if (other) throw new AppError(409, 'CUSTOMER_IDENTITY_CONFLICT', 'Phone or email is already linked to another customer profile');
    const dob = resolvedDob(input);
    const data = { fullName: input.fullName, normalizedPhone, normalizedEmail, ...dob, state: CustomerProfileState.active } satisfies Prisma.CustomerProfileUncheckedUpdateInput;
    const saved = profile ? await repository.update(transaction, profile.id, data) : await repository.create(transaction, { ...data, userId });
    await transaction.user.update({ where: { id: userId }, data: { name: saved.fullName, phone: saved.normalizedPhone } });
    return saved;
  });
}

/** Stores signup details without granting membership until the account email is verified. */
export async function saveMembershipSignupClaim(userId: string, input: CustomerProfileInput) {
  const normalizedPhone = normalizeNepalPhone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);
  const dob = resolvedDob(input);
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
    if (!user || user.role !== 'customer') throw new AppError(403, 'CUSTOMER_ACCOUNT_REQUIRED', 'A customer Website account is required');
    if (normalizeEmail(user.email) !== normalizedEmail) throw new AppError(422, 'PROFILE_EMAIL_MISMATCH', 'Use the email used to create this Website account');
    await transaction.user.update({ where: { id: userId }, data: { name: input.fullName, phone: normalizedPhone } });
    return transaction.membershipSignupClaim.upsert({
      where: { userId },
      create: { userId, fullName: input.fullName, normalizedPhone, normalizedEmail, ...dob, status: MembershipSignupStatus.pending_verification },
      update: { fullName: input.fullName, normalizedPhone, normalizedEmail, ...dob, status: MembershipSignupStatus.pending_verification, conflictReason: null },
    });
  });
}

/** Resolves a pending claim only after verified-email ownership is established. */
export async function resolveVerifiedMembershipSignup(userId: string) {
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerified: true } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const linked = await transaction.customerProfile.findUnique({ where: { userId } });
    if (linked) return linked;
    const claim = await transaction.membershipSignupClaim.findUnique({ where: { userId } });
    if (!claim) return { complete: false as const, status: 'profile_required' as const };
    if (!user.emailVerified) return { complete: false as const, status: 'email_verification_required' as const };
    if (normalizeEmail(user.email) !== claim.normalizedEmail) return { complete: false as const, status: 'email_changed' as const };
    const profiles = await transaction.customerProfile.findMany({ where: { OR: [{ normalizedPhone: claim.normalizedPhone }, { normalizedEmail: claim.normalizedEmail }] } });
    const phoneMatch = profiles.find((profile) => profile.normalizedPhone === claim.normalizedPhone);
    const emailMatch = profiles.find((profile) => profile.normalizedEmail === claim.normalizedEmail);
    if (phoneMatch || emailMatch) {
      if (!phoneMatch || !emailMatch || phoneMatch.id !== emailMatch.id || phoneMatch.userId || phoneMatch.state !== CustomerProfileState.active) {
        await transaction.membershipSignupClaim.update({ where: { userId }, data: { status: MembershipSignupStatus.conflict, conflictReason: 'The phone and email cannot be safely matched to one unlinked active membership.' } });
        return { complete: false as const, status: 'identity_conflict' as const };
      }
      const profile = await transaction.customerProfile.update({ where: { id: phoneMatch.id }, data: { userId } });
      await transaction.user.update({ where: { id: userId }, data: { name: profile.fullName, phone: profile.normalizedPhone } });
      await transaction.membershipSignupClaim.update({ where: { userId }, data: { status: MembershipSignupStatus.linked, conflictReason: null } });
      return profile;
    }
    const profile = await transaction.customerProfile.create({ data: { userId, fullName: claim.fullName, normalizedPhone: claim.normalizedPhone, normalizedEmail: claim.normalizedEmail, birthDate: claim.birthDate, preferredCalendar: claim.preferredCalendar, bsBirthMonth: claim.bsBirthMonth, bsBirthDay: claim.bsBirthDay, state: CustomerProfileState.active } });
    await transaction.membershipSignupClaim.update({ where: { userId }, data: { status: MembershipSignupStatus.linked, conflictReason: null } });
    return profile;
  });
}

export async function requireCompleteUserProfile(transaction: Prisma.TransactionClient, userId: string) {
  const profile = await transaction.customerProfile.findUnique({ where: { userId } });
  if (!profile || profile.state !== CustomerProfileState.active || !profile.normalizedPhone || !profile.normalizedEmail || !profile.birthDate || !profile.preferredCalendar) {
    throw new AppError(422, 'CUSTOMER_PROFILE_REQUIRED', 'Complete your customer profile before using membership checkout');
  }
  return profile;
}
