import { AppError } from '../../shared/errors/app-error.js';
import { getReceiptBySaleIdAndStaffId } from './receipts.repository.js';

export async function getReceiptForStaff(
  saleId: string,
  staffId: string,
) {
  const receipt = await getReceiptBySaleIdAndStaffId(saleId, staffId);

  if (!receipt) {
    throw new AppError(
      404,
      'POS_RECEIPT_NOT_FOUND',
      'Receipt not found',
    );
  }

  return receipt;
}