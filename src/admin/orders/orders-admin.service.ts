import {
  InventoryReason,
  InventorySource,
  OrderPaymentStatus,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  ShipmentBookingStatus,
  WebPaymentMethod,
  MembershipAccrualSource,
  EmailKind,
  Prisma,
} from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import { envVariables } from '../../configs/env.config.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import { getPrivateObject } from '../../shared/media/media.service.js';
import { accrueMembership } from '../../shared/membership/membership.service.js';
import { createEmailOutbox } from '../../shared/email/email.service.js';
import type { ListOrdersQuery, RefundOrderBody, UpdateOrderStatusBody } from './orders-admin.schemas.js';
import * as orderRepository from './orders-admin.repository.js';

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: [OrderStatus.cancelled],
  confirmed: [OrderStatus.packed],
  packed: [OrderStatus.shipped],
  shipped: [OrderStatus.delivered],
  delivered: [],
  cancelled: [],
};

function paymentReceiptHtml(order: { orderNumber: string; subtotal: Prisma.Decimal; merchandiseDiscount: Prisma.Decimal; shippingFee: Prisma.Decimal; shippingDeliveryFee: Prisma.Decimal; shippingPickupFee: Prisma.Decimal; total: Prisma.Decimal; advancePaymentAmount: Prisma.Decimal; codCollectionAmount: Prisma.Decimal; codMerchandiseAdvancePercent: Prisma.Decimal; paymentMethod: WebPaymentMethod; items: Array<{ productName: string; productImageUrl: string | null; variantSize: string; variantColor: string; qty: number; price: Prisma.Decimal }> }) {
  const clean = (value: string) => value.replace(/[&<>"']/g, '');
  const lines = order.items.map((item) => `<li>${item.productImageUrl?.startsWith('https://') ? `<img src="${clean(item.productImageUrl)}" alt="${clean(item.productName)}" width="64" height="64" /> ` : ''}${item.qty} × ${clean(item.productName)} (${clean(item.variantSize)}/${clean(item.variantColor)}) — NPR ${item.price.mul(item.qty).toFixed(2)}</li>`).join('');
  const pricing = `<p>Merchandise subtotal: NPR ${order.subtotal.toFixed(2)}<br>Member discount: −NPR ${order.merchandiseDiscount.toFixed(2)}<br>NCM delivery fee: NPR ${order.shippingDeliveryFee.toFixed(2)}<br>NCM pickup charge: NPR ${order.shippingPickupFee.toFixed(2)}<br>Shipping total: NPR ${order.shippingFee.toFixed(2)}<br>Order total: NPR ${order.total.toFixed(2)}</p>`;
  const payment = order.paymentMethod === WebPaymentMethod.cod
    ? `<p>COD merchandise advance (${order.codMerchandiseAdvancePercent.toFixed(2)}%): NPR ${order.advancePaymentAmount.minus(order.shippingFee).toFixed(2)}<br><strong>Paid now by QR: NPR ${order.advancePaymentAmount.toFixed(2)}</strong><br>Pay Nepal Can Move on delivery: NPR ${order.codCollectionAmount.toFixed(2)}</p>`
    : `<p><strong>Paid in full by QR: NPR ${order.advancePaymentAmount.toFixed(2)}</strong></p>`;
  return `<main><h1>ROGUEON</h1><p>Payment receipt for <strong>${clean(order.orderNumber)}</strong></p><ul>${lines}</ul>${pricing}${payment}</main>`;
}

export async function getOrders(query: ListOrdersQuery) {
  const [orders, total] = await orderRepository.listOrders(query);
  return paginatedResult(orders, total, query);
}

export async function getPendingPayments(query: ListOrdersQuery) {
  const [orders, total] = await orderRepository.listPendingPayments(query);
  return paginatedResult(orders, total, query);
}

export async function getOrder(id: string) {
  const order = await orderRepository.findOrder(id);
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  return withPrivateProofUrls(order);
}

function withPrivateProofUrls<T extends { id: string; payments: Array<{ id: string; screenshotObjectKey: string | null; screenshotUrl: string | null }> }>(order: T) {
  return {
    ...order,
    payments: order.payments.map((payment) => ({
      ...payment,
      screenshotUrl: payment.screenshotObjectKey
        ? `${envVariables.SERVER_URL.replace(/\/$/, '')}/api/v1/admin/orders/${order.id}/payments/${payment.id}/proof`
        : payment.screenshotUrl,
    })),
  };
}

export async function getPaymentProof(orderId: string, paymentId: string) {
  const payment = await orderRepository.findPaymentProof(orderId, paymentId);
  if (!payment?.screenshotObjectKey) {
    throw new AppError(404, 'PAYMENT_PROOF_NOT_FOUND', 'Payment proof was not found');
  }
  return getPrivateObject(payment.screenshotObjectKey);
}

export async function updateOrderStatus(id: string, input: UpdateOrderStatusBody) {
  return orderRepository.runOrderTransaction(async (transaction) => {
    if ((await orderRepository.lockOrder(transaction, id)).length === 0) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    }
    const order = await orderRepository.findOrderState(transaction, id);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    const statusChanged = input.status !== order.status;
    if (statusChanged && !transitions[order.status].includes(input.status)) {
      throw new AppError(409, 'INVALID_ORDER_TRANSITION', `Cannot move order from ${order.status} to ${input.status}`);
    }
    if (!statusChanged && input.trackingRef === undefined) {
      throw new AppError(409, 'ORDER_STATE_UNCHANGED', 'Order status is already set');
    }
    const data: { status: OrderStatus; trackingRef?: string | null } = { status: input.status };
    if (input.trackingRef !== undefined) data.trackingRef = input.trackingRef;
    await orderRepository.updateOrderInTransaction(transaction, id, data);
    return orderRepository.findOrderDetailInTransaction(transaction, id);
  });
}

export function verifyPayment(id: string, adminId: string, action: 'confirm' | 'reject') {
  return orderRepository.runOrderTransaction(async (transaction) => {
    if ((await orderRepository.lockOrder(transaction, id)).length === 0) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    }
    const order = await orderRepository.findOrderState(transaction, id);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    if (order.payments.length !== 1) {
      throw new AppError(409, 'PAYMENT_STATE_CONFLICT', 'Order must have exactly one pending payment');
    }
    const paymentId = order.payments[0]!.id;
    await orderRepository.lockPayment(transaction, paymentId);
    const payment = await orderRepository.findPayment(transaction, paymentId);
    if (!payment || payment.status !== PaymentStatus.pending_verification) {
      throw new AppError(409, 'PAYMENT_ALREADY_VERIFIED', 'Payment was already verified');
    }

    const now = new Date();
    if (action === 'reject') {
      await orderRepository.updatePayment(transaction, paymentId, {
        status: PaymentStatus.failed,
        verifiedBy: adminId,
        verifiedAt: now,
      });
      await orderRepository.updateOrderInTransaction(transaction, id, {
        paymentStatus: OrderPaymentStatus.failed,
      });
      return orderRepository.findOrderDetailInTransaction(transaction, id);
    }

    if (order.status !== OrderStatus.pending || order.paymentStatus !== OrderPaymentStatus.unpaid) {
      throw new AppError(409, 'ORDER_STATE_CONFLICT', 'Order is not awaiting payment confirmation');
    }
    // Pre-COD QR orders were persisted before advancePaymentAmount existed and
    // therefore carry the migration default of zero. They remain payable in
    // full; COD orders always verify only their recorded advance.
    const amountDue = order.paymentMethod === WebPaymentMethod.cod || order.advancePaymentAmount.gt(0)
      ? order.advancePaymentAmount
      : order.total;
    if (!payment.amount.equals(amountDue)) {
      throw new AppError(409, 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount does not match order total');
    }
    for (const item of order.items) {
      await changeInventory({
        transaction,
        variantId: item.variantId,
        changeQty: -item.qty,
        reason: InventoryReason.web_order,
        source: InventorySource.website,
        referenceId: id,
      });
    }
    await orderRepository.updatePayment(transaction, paymentId, {
      status: PaymentStatus.success,
      verifiedBy: adminId,
      verifiedAt: now,
      paidAt: now,
    });
    await orderRepository.updateOrderInTransaction(transaction, id, {
      paymentStatus: OrderPaymentStatus.paid,
      status: OrderStatus.confirmed,
    });
    let receiptEmail = order.guestEmail ?? undefined;
    let customerName = order.guestName ?? 'Customer';
    let eligibleSpend: string | undefined;
    // Guests intentionally have no customerProfileId and never accrue membership.
    if (order.customerProfileId) {
      const accrual = await accrueMembership({
        transaction,
        customerProfileId: order.customerProfileId,
        source: MembershipAccrualSource.web_order,
        orderId: id,
        netMerchandiseAmount: order.subtotal.minus(order.merchandiseDiscount),
        now,
      });
      const customer = await transaction.customerProfile.findUnique({ where: { id: order.customerProfileId } });
      receiptEmail = customer?.normalizedEmail ?? receiptEmail;
      customerName = customer?.fullName ?? customerName;
      eligibleSpend = accrual.membership.eligibleNetSpend.toFixed(2);
    }
    if (receiptEmail) {
      const paidLabel = order.paymentMethod === WebPaymentMethod.cod ? `QR advance paid: NPR ${order.advancePaymentAmount.toFixed(2)}. Nepal Can Move will collect NPR ${order.codCollectionAmount.toFixed(2)} on delivery.` : `Amount paid in full: NPR ${order.total.toFixed(2)}.`;
      const text = `Thank you, ${customerName}! Your ROGUEON order ${order.orderNumber} is confirmed. ${paidLabel}${eligibleSpend ? ` Current-year eligible spending: NPR ${eligibleSpend}.` : ''}`;
      const confirmationHtml = `<main><h1>ROGUEON</h1><p>Thank you, ${customerName.replace(/[&<>"']/g, '')}.</p><p>Your order <strong>${order.orderNumber}</strong> is confirmed.</p><p>${paidLabel}</p></main>`;
      await createEmailOutbox({ kind: EmailKind.web_order_confirmation, recipientEmail: receiptEmail, deduplicationKey: `web-order-confirmed:${order.id}`, payload: { subject: `ROGUEON order confirmed — ${order.orderNumber}`, text, html: confirmationHtml } }, transaction);
      await createEmailOutbox({ kind: EmailKind.web_payment_receipt, recipientEmail: receiptEmail, deduplicationKey: `web-payment-receipt:${order.id}`, payload: { subject: `Your ROGUEON receipt — ${order.orderNumber}`, text: `Payment receipt for ${order.orderNumber}. Amount paid: NPR ${order.total.toFixed(2)}.`, html: paymentReceiptHtml(order) } }, transaction);
    }
    return orderRepository.findOrderDetailInTransaction(transaction, id);
  });
}

function isConfirmedWarehouseReturn(shipment: { carrierStatus: string | null; events: Array<{ event: string; status: string }> }) {
  const returned = /(?:returned[_ -]?to[_ -]?(?:warehouse|sender)|return[_ -]?(?:completed|delivered))/i;
  return returned.test(shipment.carrierStatus ?? '') || shipment.events.some((event) => returned.test(event.event) || returned.test(event.status));
}

/**
 * Cancelling a COD order creates a staff-visible refund task. Actual money is
 * returned manually; completion is recorded only after the staff member does it.
 */
export function refundCodOrder(id: string, input: RefundOrderBody) {
  return orderRepository.runOrderTransaction(async (transaction) => {
    if ((await orderRepository.lockOrder(transaction, id)).length === 0) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    const order = await orderRepository.findOrderForRefund(transaction, id);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    if (order.paymentMethod !== WebPaymentMethod.cod) throw new AppError(409, 'REFUND_NOT_ELIGIBLE', 'Only prepaid COD advances can be refunded here. POS sales and full QR orders are not refundable.');

    if (input.action === 'complete') {
      if (order.refundStatus !== RefundStatus.pending) throw new AppError(409, 'REFUND_NOT_PENDING', 'There is no pending manual refund for this order.');
      await orderRepository.updateOrderInTransaction(transaction, id, { refundStatus: RefundStatus.completed, refundCompletedAt: new Date(), ...(input.reference ? { refundReference: input.reference } : {}) });
      return orderRepository.findOrderDetailInTransaction(transaction, id);
    }

    if (order.refundStatus) throw new AppError(409, 'REFUND_ALREADY_RECORDED', 'A refund has already been recorded for this order.');
    if (order.paymentStatus !== OrderPaymentStatus.paid || order.advancePaymentAmount.lte(0)) throw new AppError(409, 'REFUND_NOT_ELIGIBLE', 'The COD advance must be verified before it can be refunded.');
    const shipment = order.shipment;
    const wasReturned = shipment?.bookingStatus === ShipmentBookingStatus.booked && isConfirmedWarehouseReturn(shipment);
    if (shipment?.bookingStatus === ShipmentBookingStatus.booked && !wasReturned) throw new AppError(409, 'REFUND_NOT_ELIGIBLE', 'This order is with Nepal Can Move. A refund can be requested only after its confirmed return to the warehouse.');
    if (!wasReturned && order.status !== OrderStatus.confirmed && order.status !== OrderStatus.packed) throw new AppError(409, 'REFUND_NOT_ELIGIBLE', 'Only confirmed or packed COD orders may be cancelled before courier handoff.');

    // A confirmed NCM warehouse-return event has already restored stock.
    if (!wasReturned) {
      for (const item of order.items) {
        await changeInventory({ transaction, variantId: item.variantId, changeQty: item.qty, reason: InventoryReason.restock, source: InventorySource.admin, referenceId: id });
      }
    }
    await orderRepository.updateOrderInTransaction(transaction, id, {
      status: OrderStatus.cancelled,
      refundStatus: RefundStatus.pending,
      refundAmount: order.advancePaymentAmount,
      refundReason: input.reason ?? (wasReturned ? 'COD order returned to warehouse' : 'Cancelled before courier handoff'),
      refundRequestedAt: new Date(),
    });
    return orderRepository.findOrderDetailInTransaction(transaction, id);
  });
}
