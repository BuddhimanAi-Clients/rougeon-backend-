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
    subtotal: order.subtotal.toFixed(2),
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
    paymentMethod: order.paymentMethod,
    delivery: {
      name: order.guestName,
      phone: order.guestPhone,
      fullAddress: order.guestFullAddress,
      city: order.guestCity,
    },
    trackingRef: order.trackingRef,
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
    })),
    payments: order.payments.map((payment) => ({
      ...payment,
      amount: payment.amount.toFixed(2),
    })),
  };
}

export async function getCustomerOrders(
  userId: string,
  query: ListCustomerOrdersQuery,
) {
  const [orders, total] = await orderRepository.listCustomerOrders(userId, query);
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
  return paymentInstructions(order);
}
