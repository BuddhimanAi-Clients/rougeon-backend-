import { prisma } from '../../configs/database.config.js';

export async function getReceiptBySaleIdAndStaffId(
  saleId: string,
  staffId: string,
) {
  const receipt = await prisma.posSale.findFirst({
    where: {
      id: saleId,
      staffId,
    },
    select: {
      id: true,
      saleNumber: true,
      createdAt: true,
      paymentMethod: true,
      subtotal: true,
      total: true,
      staff: {
        select: {
          id: true,
          name: true,
        },
      },
      items: {
        orderBy: {
          id: 'asc',
        },
        select: {
          id: true,
          qty: true,
          price: true,
          variant: {
            select: {
              id: true,
              sku: true,
              size: true,
              color: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!receipt) {
    return null;
  }

  return {
    ...receipt,
    subtotal: receipt.subtotal.toString(),
    total: receipt.total.toString(),
    items: receipt.items.map((item) => ({
      ...item,
      price: item.price.toString(),
    })),
  };
}