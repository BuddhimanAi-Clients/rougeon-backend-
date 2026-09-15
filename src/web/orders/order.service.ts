import { OrderPaymentStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import type { CartOwner } from '../cart/cart.schemas.js';
import { paymentInstructions } from '../payments/payment-instructions.service.js';
import * as orderRepository from './order.repository.js';
import type { ListCustomerOrdersQuery } from './order.schemas.js';

type OrderRecord = NonNullable<
  Awaited<ReturnType<typeof orderRepository.findOwnedOrder>>
>;

function orderResponse(order: OrderRecord) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    refundStatus: order.refundStatus,
    refundAmount: order.refundAmount?.toFixed(2) ?? null,
    refundReason: order.refundReason,
    refundRequestedAt: order.refundRequestedAt,
    refundCompletedAt: order.refundCompletedAt,
    subtotal: order.subtotal.toFixed(2),
    merchandiseDiscount: order.merchandiseDiscount.toFixed(2),
    membershipDiscountPercent: order.membershipDiscountPercent.toFixed(2),
    membershipTierSnapshot: order.membershipTierSnapshot,
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
    advancePaymentAmount: order.advancePaymentAmount.toFixed(2),
    codCollectionAmount: order.codCollectionAmount.toFixed(2),
    codMerchandiseAdvancePercent: order.codMerchandiseAdvancePercent.toFixed(2),
    paymentMethod: order.paymentMethod,
    delivery: {
      name: order.guestName,
      phone: order.guestPhone,
      fullAddress: order.guestFullAddress,
      city: order.guestCity,
    },
    trackingRef: order.trackingRef,
    shipment: order.shipment ? {
      carrier: order.shipment.carrier,
      carrierOrderId: order.shipment.carrierOrderId,
      bookingStatus: order.shipment.bookingStatus,
      carrierStatus: order.shipment.carrierStatus,
      events: order.shipment.events.map((event) => ({ event: event.event, status: event.status, occurredAt: event.occurredAt, receivedAt: event.receivedAt })),
    } : null,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productName: item.productName,
      productImageUrl: item.productImageUrl,
      variantSku: item.variantSku,
      variantSize: item.variantSize,
      variantColor: item.variantColor,
      qty: item.qty,
      price: item.price.toFixed(2),
      lineTotal: item.price.mul(item.qty).toFixed(2),
      currentStockQty: item.variant.stockQty,
      stockAvailable: item.variant.stockQty >= item.qty,
    })),
    payments: order.payments.map((payment) => ({
      ...payment,
      amount: payment.amount.toFixed(2),
    })),
  };
}

export async function getCustomerOrders(
  owner: CartOwner,
  query: ListCustomerOrdersQuery,
) {
  const [orders, total] = await orderRepository.listCustomerOrders(owner, query);
  return paginatedResult(orders.map(orderResponse), total, query);
}

export async function getOrder(id: string, owner: CartOwner) {
  const order = await orderRepository.findOwnedOrder(id, owner);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }
  return orderResponse(order);
}

export async function getPaymentInstructions(id: string, owner: CartOwner) {
  const order = await orderRepository.findOwnedOrder(id, owner);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }
  const currentPayment = order.payments[0];
  const eligible =
    order.status === OrderStatus.pending &&
    ((order.paymentStatus === OrderPaymentStatus.unpaid &&
      currentPayment?.status === PaymentStatus.awaiting_proof) ||
      (order.paymentStatus === OrderPaymentStatus.failed &&
        currentPayment?.status === PaymentStatus.failed));
  if (!eligible) {
    throw new AppError(
      409,
      'PAYMENT_NOT_ELIGIBLE',
      'Order is not eligible for payment instructions',
    );
  }
  if (!currentPayment?.qrConfiguration) {
    throw new AppError(503, 'PAYMENT_CONFIGURATION_UNAVAILABLE', 'Payment instructions are unavailable for this order');
  }
  return paymentInstructions(order, currentPayment.qrConfiguration);
}
