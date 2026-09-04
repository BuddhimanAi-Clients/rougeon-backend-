import {
  InventoryReason,
  InventorySource,
  OrderPaymentStatus,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import { envVariables } from '../../configs/env.config.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import { getPrivateObject } from '../../shared/media/media.service.js';
import type { ListOrdersQuery, UpdateOrderStatusBody } from './orders-admin.schemas.js';
import * as orderRepository from './orders-admin.repository.js';

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: [OrderStatus.cancelled],
  confirmed: [OrderStatus.packed],
  packed: [OrderStatus.shipped],
  shipped: [OrderStatus.delivered],
  delivered: [],
  cancelled: [],
};

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
    if (!payment.amount.equals(order.total)) {
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
    return orderRepository.findOrderDetailInTransaction(transaction, id);
  });
}
