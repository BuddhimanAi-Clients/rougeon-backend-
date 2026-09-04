import { AppError } from '../../shared/errors/app-error.js';
import { createObjectKey, deleteObject, inspectImage, publicMediaUrl, uploadImage } from '../../shared/media/media.service.js';
import type { PaymentQrConfigurationBody } from './payment-settings.schemas.js';
import * as repository from './payment-settings.repository.js';

const MAX_QR_BYTES = 4 * 1024 * 1024;

export function listConfigurations() { return repository.listConfigurations(); }

export async function createConfiguration(adminId: string, input: PaymentQrConfigurationBody, file: Express.Multer.File | undefined) {
  if (!file) throw new AppError(400, 'QR_IMAGE_REQUIRED', 'A QR image is required');
  const image = await inspectImage(file, MAX_QR_BYTES);
  const objectKey = createObjectKey('payment-qr', image.extension);
  await uploadImage(objectKey, image);
  try {
    return await repository.runPaymentQrTransaction(async (transaction) => {
      await repository.deactivateActiveConfigurations(transaction, adminId);
      return repository.createAndActivateConfiguration(transaction, {
        objectKey, publicUrl: publicMediaUrl(objectKey), detectedMimeType: image.mimeType, byteSize: image.byteSize, adminId,
        ...(input.providerName ? { providerName: input.providerName } : {}),
        ...(input.accountName ? { accountName: input.accountName } : {}),
        ...(input.accountIdentifier ? { accountIdentifier: input.accountIdentifier } : {}),
        ...(input.instructions ? { instructions: input.instructions } : {}),
      });
    });
  } catch (error) {
    await deleteObject(objectKey).catch(() => undefined);
    throw error;
  }
}

export async function reactivateConfiguration(id: string, adminId: string) {
  return repository.runPaymentQrTransaction(async (transaction) => {
    const configuration = await repository.findConfiguration(transaction, id);
    if (!configuration) throw new AppError(404, 'PAYMENT_QR_CONFIGURATION_NOT_FOUND', 'Payment QR configuration was not found');
    await repository.deactivateActiveConfigurations(transaction, adminId, id);
    return repository.activateConfiguration(transaction, id, adminId);
  });
}
