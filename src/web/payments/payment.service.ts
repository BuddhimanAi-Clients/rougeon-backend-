import { OrderPaymentStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import { createObjectKey, deleteObject, inspectImage, uploadImage } from '../../shared/media/media.service.js';
import type { CartOwner } from '../cart/cart.schemas.js';
import * as repository from './payment.repository.js';

const MAX_PROOF_BYTES = 8 * 1024 * 1024;

function assertEligible(order: NonNullable<Awaited<ReturnType<typeof repository.findOwnedOrder>>>) {
  if (order.status !== OrderStatus.pending || (order.paymentStatus !== OrderPaymentStatus.unpaid && order.paymentStatus !== OrderPaymentStatus.failed)) {
    throw new AppError(409, 'PAYMENT_PROOF_NOT_ELIGIBLE', 'This order is not eligible for payment-proof submission');
  }
  if (order.payments.some((payment) => payment.status === PaymentStatus.pending_verification || payment.status === PaymentStatus.success)) {
    throw new AppError(409, 'PAYMENT_PROOF_ALREADY_PENDING', 'A payment proof is already awaiting verification');
  }
  const latest = order.payments[0];
  if (!latest || (latest.status !== PaymentStatus.awaiting_proof && latest.status !== PaymentStatus.failed)) {
    throw new AppError(409, 'PAYMENT_PROOF_NOT_ELIGIBLE', 'This order is not eligible for a payment proof');
  }
  return latest;
}

function assertLiveStock(order: NonNullable<Awaited<ReturnType<typeof repository.findOwnedOrder>>>) {
  const unavailable = order.items.find((item) => item.variant.stockQty < item.qty);
  if (unavailable) {
    throw new AppError(409, 'ORDER_STOCK_UNAVAILABLE', unavailable.productName + ' no longer has enough stock for this unpaid order. Update your bag and place a new order before paying.');
  }
}

export async function submitPaymentProof(orderId: string, owner: CartOwner, file: Express.Multer.File | undefined) {
  if (!file) throw new AppError(400, 'PAYMENT_PROOF_REQUIRED', 'A payment screenshot is required');
  const initialOrder = await repository.findOwnedOrder(orderId, owner);
  if (!initialOrder) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  assertEligible(initialOrder);
  assertLiveStock(initialOrder);
  const image = await inspectImage(file, MAX_PROOF_BYTES);
  const objectKey = createObjectKey(`payment-proofs/${orderId}`, image.extension);
  await uploadImage(objectKey, image);
  try {
    return await repository.runPaymentTransaction(async (transaction) => {
      if ((await repository.lockOrder(transaction, orderId)).length === 0) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      const order = await repository.findOwnedOrderInTransaction(transaction, orderId, owner);
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      const current = assertEligible(order);
      assertLiveStock(order);
      const data = { screenshotUrl: null, screenshotObjectKey: objectKey, screenshotMimeType: image.mimeType, screenshotSize: image.byteSize };
      if (current.status === PaymentStatus.awaiting_proof) {
        await repository.updatePaymentProof(transaction, current.id, data);
      } else {
        await repository.createPaymentProofAttempt(transaction, { orderId: order.id, amount: order.advancePaymentAmount, qrConfigurationId: current.qrConfigurationId, ...data });
        await transaction.order.update({ where: { id: order.id }, data: { paymentStatus: OrderPaymentStatus.unpaid } });
      }
      return { status: PaymentStatus.pending_verification };
    });
  } catch (error) {
    await deleteObject(objectKey).catch(() => undefined);
    throw error;
  }
}
