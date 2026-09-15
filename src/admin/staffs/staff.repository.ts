import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import { paginationArgs } from '../../shared/http/pagination.js';
import type { ListStaffQuery, UpdateStaffBody } from './staff.schemas.js';

const staffSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  phone: true,
  image: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

function staffWhere(query: ListStaffQuery): Prisma.UserWhereInput {
  return {
    role: query.role ?? { in: [UserRole.cashier, UserRole.admin] },
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

export async function listStaff(query: ListStaffQuery) {
  const where = staffWhere(query);
  return prisma.$transaction([
    prisma.user.findMany({
      where,
      select: staffSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...paginationArgs(query),
    }),
    prisma.user.count({ where }),
  ]);
}

export function findStaffById(id: string) {
  return prisma.user.findFirst({
    where: { id, role: { in: [UserRole.cashier, UserRole.admin] } },
    select: staffSelect,
  });
}

export function runStaffTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export function findStaffState(transaction: Prisma.TransactionClient, id: string) {
  return transaction.user.findFirst({
    where: { id, role: { in: [UserRole.cashier, UserRole.admin] } },
    select: {
      role: true,
      isActive: true,
      accounts: {
        where: { providerId: 'credential', password: { not: null } },
        select: { id: true },
      },
    },
  });
}

export function countActiveAdmins(transaction: Prisma.TransactionClient) {
  return transaction.user.count({
    where: {
      role: UserRole.admin,
      isActive: true,
      accounts: { some: { providerId: 'credential', password: { not: null } } },
    },
  });
}

export function updateStaffInTransaction(
  transaction: Prisma.TransactionClient,
  id: string,
  input: UpdateStaffBody,
) {
  const data: Prisma.UserUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.role !== undefined) data.role = input.role;
  return transaction.user.update({ where: { id }, data, select: staffSelect });
}

export async function removeStaffAccess(
  transaction: Prisma.TransactionClient,
  id: string,
) {
  await transaction.session.deleteMany({ where: { userId: id } });
  await transaction.user.update({ where: { id }, data: { isActive: false } });
}

export function reactivateStaff(
  transaction: Prisma.TransactionClient,
  id: string,
) {
  return transaction.user.update({
    where: { id },
    data: { isActive: true },
    select: staffSelect,
  });
}

export function deleteNewUser(id: string) {
  return prisma.user.deleteMany({ where: { id } });
}

export async function finalizeNewStaffInTransaction(
  transaction: Prisma.TransactionClient,
  id: string,
  role: UserRole,
) {
  const user = await transaction.user.update({
    where: { id },
    // Staff accounts are provisioned by an authenticated administrator.
    // Mark them verified so the customer-only verification gate never
    // blocks Admin/POS access and no verification email is required.
    data: { role, emailVerified: true },
    select: staffSelect,
  });
  await transaction.session.deleteMany({ where: { userId: id } });
  return user;
}
