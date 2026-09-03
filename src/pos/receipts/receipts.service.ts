import { envVariables } from '../../configs/env.config.js';
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

  return {
    saleNumber: receipt.saleNumber,
    cashierName: receipt.cashierName,
    createdAt: receipt.createdAt,
    items: receipt.items.map((item) => ({
      name: `${item.productName}, Size ${item.variantSize}, ${item.variantColor}`,
      sku: item.variantSku,
      qty: item.qty,
      price: item.price.toFixed(2),
      lineTotal: item.price.mul(item.qty).toFixed(2),
    })),
    subtotal: receipt.subtotal.toFixed(2),
    total: receipt.total.toFixed(2),
    paymentMethod: receipt.paymentMethod,
    storeInfo: {
      name: envVariables.STORE_NAME,
      address: envVariables.STORE_ADDRESS,
    },
  };
}
