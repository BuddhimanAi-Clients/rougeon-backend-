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

  const snapshot = receipt.membershipTierSnapshot;
  const tierName = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && typeof snapshot.name === 'string' ? snapshot.name : null;

  return {
    saleNumber: receipt.saleNumber,
    cashierName: receipt.cashierName,
    createdAt: receipt.createdAt,
    items: receipt.items.map((item) => ({
      name: `${item.productName}, Size ${item.variantSize}, ${item.variantColor}`,
      productName: item.productName,
      size: item.variantSize,
      color: item.variantColor,
      sku: item.variantSku,
      qty: item.qty,
      price: item.price.toFixed(2),
      lineTotal: item.price.mul(item.qty).toFixed(2),
      membershipDiscountEligible: item.membershipDiscountEligible,
      discountAmount: item.discountAmount.toFixed(2),
    })),
    itemCount: receipt.items.reduce((count, item) => count + item.qty, 0),
    subtotal: receipt.subtotal.toFixed(2),
    discount: {
      amount: receipt.merchandiseDiscount.toFixed(2),
      percent: receipt.membershipDiscountPercent.toFixed(2),
      tierName,
      waived: receipt.membershipDiscountWaived,
    },
    total: receipt.total.toFixed(2),
    paymentMethod: receipt.paymentMethod,
    cashAmount: receipt.cashAmount.toFixed(2),
    qrAmount: receipt.qrAmount.toFixed(2),
    customer: receipt.customerProfile
      ? { name: receipt.customerProfile.fullName, phone: receipt.customerProfile.normalizedPhone }
      : null,
    storeInfo: {
      name: envVariables.STORE_NAME,
      address: envVariables.STORE_ADDRESS,
      ...(envVariables.STORE_PHONE ? { phone: envVariables.STORE_PHONE } : {}),
      ...(envVariables.STORE_PAN ? { pan: envVariables.STORE_PAN } : {}),
    },
    footerNote: envVariables.RECEIPT_FOOTER_NOTE ?? null,
  };
}
