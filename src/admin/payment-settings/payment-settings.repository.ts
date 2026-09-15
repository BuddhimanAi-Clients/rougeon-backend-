import { Prisma } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';

const configurationInclude = {
  uploadedBy: { select: { id: true, name: true, email: true } },
  activatedBy: { select: { id: true, name: true, email: true } },
  events: { include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.PaymentQrConfigurationInclude;

export function listConfigurations() {
  return prisma.paymentQrConfiguration.findMany({ include: configurationInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
}

export function runPaymentQrTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function createAndActivateConfiguration(transaction: Prisma.TransactionClient, input: {
  objectKey: string; publicUrl: string; detectedMimeType: string; byteSize: number; providerName?: string; accountName?: string; accountIdentifier?: string; instructions?: string; codMerchandiseAdvancePercent?: number; adminId: string;
}) {
  return transaction.paymentQrConfiguration.create({
    data: {
      objectKey: input.objectKey, publicUrl: input.publicUrl, detectedMimeType: input.detectedMimeType, byteSize: input.byteSize,
      ...(input.providerName ? { providerName: input.providerName } : {}),
      ...(input.accountName ? { accountName: input.accountName } : {}),
      ...(input.accountIdentifier ? { accountIdentifier: input.accountIdentifier } : {}),
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(input.codMerchandiseAdvancePercent !== undefined ? { codMerchandiseAdvancePercent: input.codMerchandiseAdvancePercent } : {}),
      isActive: true, uploadedById: input.adminId, activatedById: input.adminId, activatedAt: new Date(),
      events: { create: { actorId: input.adminId, type: 'activated' } },
    },
    include: configurationInclude,
  });
}

export async function deactivateActiveConfigurations(transaction: Prisma.TransactionClient, actorId: string, exceptId?: string) {
  const active = await transaction.paymentQrConfiguration.findMany({ where: { isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (active.length === 0) return;
  await transaction.paymentQrConfiguration.updateMany({ where: { id: { in: active.map((item) => item.id) } }, data: { isActive: false } });
  await transaction.paymentQrConfigurationEvent.createMany({ data: active.map((item) => ({ configurationId: item.id, actorId, type: 'deactivated' })) });
}

export function findConfiguration(transaction: Prisma.TransactionClient, id: string) {
  return transaction.paymentQrConfiguration.findUnique({ where: { id }, include: configurationInclude });
}

export function activateConfiguration(transaction: Prisma.TransactionClient, id: string, adminId: string) {
  return transaction.paymentQrConfiguration.update({
    where: { id },
    data: { isActive: true, activatedById: adminId, activatedAt: new Date(), events: { create: { actorId: adminId, type: 'activated' } } },
    include: configurationInclude,
  });
}

export function countOpenPaymentsForConfiguration(transaction: Prisma.TransactionClient, id: string) {
  return transaction.payment.count({ where: { qrConfigurationId: id, status: { in: ['awaiting_proof', 'pending_verification'] } } });
}

export function updateConfigurationMetadata(transaction: Prisma.TransactionClient, id: string, input: {
  providerName?: string | undefined; accountName?: string | undefined; accountIdentifier?: string | undefined; instructions?: string | undefined; codMerchandiseAdvancePercent?: number | undefined;
}) {
  return transaction.paymentQrConfiguration.update({
    where: { id },
    data: {
      ...(input.providerName !== undefined ? { providerName: input.providerName } : {}),
      ...(input.accountName !== undefined ? { accountName: input.accountName } : {}),
      ...(input.accountIdentifier !== undefined ? { accountIdentifier: input.accountIdentifier } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.codMerchandiseAdvancePercent !== undefined ? { codMerchandiseAdvancePercent: input.codMerchandiseAdvancePercent } : {}),
    },
    include: configurationInclude,
  });
}
