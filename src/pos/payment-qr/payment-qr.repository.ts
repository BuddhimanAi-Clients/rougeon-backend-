import { prisma } from '../../configs/database.config.js';

/** The QR an administrator currently has active under Payment QR settings. */
export function findActivePaymentQr() {
  return prisma.paymentQrConfiguration.findFirst({
    where: { isActive: true },
    orderBy: { activatedAt: 'desc' },
    select: {
      id: true,
      publicUrl: true,
      providerName: true,
      accountName: true,
      accountIdentifier: true,
      activatedAt: true,
    },
  });
}
