import type { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';

export function paymentInstructions(input: {
  total: Prisma.Decimal;
  orderNumber: string;
}, configuration: {
  publicUrl: string;
  providerName: string | null;
  accountName: string | null;
  accountIdentifier: string | null;
  instructions: string | null;
}) {
  if (!configuration.providerName || !configuration.accountName || !configuration.accountIdentifier || !configuration.instructions) {
    throw new AppError(503, 'PAYMENT_CONFIGURATION_INCOMPLETE', 'Active payment instructions are incomplete');
  }
  return {
    method: 'qr' as const,
    qrImageUrl: configuration.publicUrl,
    providerName: configuration.providerName,
    accountName: configuration.accountName,
    accountIdentifier: configuration.accountIdentifier,
    amount: input.total.toFixed(2),
    reference: input.orderNumber,
    instructions: configuration.instructions,
  };
}
