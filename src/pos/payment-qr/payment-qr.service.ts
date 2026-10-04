import { AppError } from '../../shared/errors/app-error.js';
import { findActivePaymentQr } from './payment-qr.repository.js';

/**
 * Counter QR shown to the customer when a cashier selects QR payment. It is the
 * same administrator-managed QR the Website checkout uses, so there is a single
 * place to change it.
 */
export async function getActivePaymentQr() {
  const configuration = await findActivePaymentQr();
  if (!configuration) {
    throw new AppError(
      404,
      'PAYMENT_QR_NOT_CONFIGURED',
      'No payment QR is active. Ask an administrator to upload one under Payment QR.',
    );
  }
  return {
    id: configuration.id,
    qrImageUrl: configuration.publicUrl,
    providerName: configuration.providerName,
    accountName: configuration.accountName,
    accountIdentifier: configuration.accountIdentifier,
    activatedAt: configuration.activatedAt,
  };
}
