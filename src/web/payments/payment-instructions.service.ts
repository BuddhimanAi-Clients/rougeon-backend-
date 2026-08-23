import type { Prisma } from '@prisma/client';
import { envVariables } from '../../configs/env.config.js';

export function paymentInstructions(input: {
  total: Prisma.Decimal;
  orderNumber: string;
}) {
  return {
    method: 'qr' as const,
    qrImageUrl: envVariables.PAYMENT_QR_IMAGE_URL,
    providerName: envVariables.PAYMENT_PROVIDER_NAME,
    accountName: envVariables.PAYMENT_ACCOUNT_NAME,
    accountIdentifier: envVariables.PAYMENT_ACCOUNT_IDENTIFIER,
    amount: input.total.toFixed(2),
    reference: input.orderNumber,
    instructions: envVariables.PAYMENT_INSTRUCTIONS,
  };
}
