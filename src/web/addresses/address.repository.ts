import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';
import type {
  CreateAddressBody,
  UpdateAddressBody,
} from './address.schemas.js';

export function listAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { label: 'asc' }, { id: 'asc' }],
  });
}

export function runAddressTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export function lockUser(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE
  `);
}

export function countAddresses(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  return transaction.address.count({ where: { userId } });
}

export function findAddress(
  transaction: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  return transaction.address.findFirst({ where: { id, userId } });
}

export function findFirstAddress(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  return transaction.address.findFirst({
    where: { userId },
    orderBy: [{ label: 'asc' }, { id: 'asc' }],
  });
}

export function unsetDefaults(
  transaction: Prisma.TransactionClient,
  userId: string,
  exceptId?: string,
) {
  return transaction.address.updateMany({
    where: {
      userId,
      isDefault: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { isDefault: false },
  });
}

export function createAddress(
  transaction: Prisma.TransactionClient,
  userId: string,
  input: CreateAddressBody,
  isDefault: boolean,
) {
  return transaction.address.create({
    data: {
      userId,
      label: input.label,
      fullAddress: input.fullAddress,
      city: input.city,
      phone: input.phone,
      isDefault,
    },
  });
}

export function updateAddress(
  transaction: Prisma.TransactionClient,
  id: string,
  input: UpdateAddressBody,
) {
  const data: Prisma.AddressUncheckedUpdateInput = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.fullAddress !== undefined) data.fullAddress = input.fullAddress;
  if (input.city !== undefined) data.city = input.city;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.isDefault !== undefined) data.isDefault = input.isDefault;
  return transaction.address.update({ where: { id }, data });
}

export function setDefault(transaction: Prisma.TransactionClient, id: string) {
  return transaction.address.update({
    where: { id },
    data: { isDefault: true },
  });
}

export function deleteAddress(transaction: Prisma.TransactionClient, id: string) {
  return transaction.address.delete({ where: { id } });
}
