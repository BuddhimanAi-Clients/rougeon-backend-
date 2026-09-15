import { Prisma, type CustomerProfileState } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';

export function findById(id: string) { return prisma.customerProfile.findUnique({ where: { id } }); }
export function findByPhone(normalizedPhone: string) { return prisma.customerProfile.findUnique({ where: { normalizedPhone } }); }
export function findByEmail(normalizedEmail: string) { return prisma.customerProfile.findUnique({ where: { normalizedEmail } }); }
export function findByUserId(userId: string) { return prisma.customerProfile.findUnique({ where: { userId } }); }
export function findByPhoneOrEmail(normalizedPhone: string, normalizedEmail: string) {
  return prisma.customerProfile.findMany({ where: { OR: [{ normalizedPhone }, { normalizedEmail }] } });
}
export function create(transaction: Prisma.TransactionClient, data: Prisma.CustomerProfileUncheckedCreateInput) { return transaction.customerProfile.create({ data }); }
export function update(transaction: Prisma.TransactionClient, id: string, data: Prisma.CustomerProfileUncheckedUpdateInput) { return transaction.customerProfile.update({ where: { id }, data }); }
export function setState(transaction: Prisma.TransactionClient, id: string, state: CustomerProfileState) { return transaction.customerProfile.update({ where: { id }, data: { state } }); }
