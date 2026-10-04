import { prisma } from '../../configs/database.config.js';

export function getReceiptBySaleIdAndStaffId(
  saleId: string,
  staffId: string,
) {
  return prisma.posSale.findFirst({
    where: {
      id: saleId,
      staffId,
    },
    select: {
      saleNumber: true,
      cashierName: true,
      createdAt: true,
      paymentMethod: true,
      subtotal: true,
      merchandiseDiscount: true,
      membershipDiscountPercent: true,
      membershipTierSnapshot: true,
      membershipDiscountWaived: true,
      total: true,
      customerProfile: { select: { fullName: true, normalizedPhone: true } },
      items: {
        orderBy: { id: 'asc' },
        select: {
          productName: true,
          variantSku: true,
          variantSize: true,
          variantColor: true,
          qty: true,
          price: true,
          membershipDiscountEligible: true,
          discountAmount: true,
        },
      },
    },
  });
}
