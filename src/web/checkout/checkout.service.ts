import { randomBytes } from 'node:crypto';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  UserRole,
  WebPaymentMethod,
} from '@prisma/client';
import { envVariables } from '../../configs/env.config.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { CartOwner } from '../cart/cart.schemas.js';
import { paymentInstructions } from '../payments/payment-instructions.service.js';
import type { CheckoutBody } from './checkout.schemas.js';
import * as checkoutRepository from './checkout.repository.js';

function createOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `WEB-${date}-${randomBytes(5).toString('hex').toUpperCase()}`;
}

function firstProductImage(images: Prisma.JsonValue) {
  if (!Array.isArray(images)) {
    return undefined;
  }
  return images.find((image): image is string => typeof image === 'string');
}

export function checkout(owner: CartOwner, input: CheckoutBody) {
  return checkoutRepository.runCheckoutTransaction(async (transaction) => {
    const cart = await checkoutRepository.findCart(transaction, owner);
    if (!cart) {
      throw new AppError(422, 'EMPTY_CART', 'Cart is empty');
    }
    await checkoutRepository.lockCart(transaction, cart.id);
    const cartState = await checkoutRepository.findCartState(transaction, cart.id);
    if (!cartState || cartState.items.length === 0) {
      throw new AppError(422, 'EMPTY_CART', 'Cart is empty');
    }

    let delivery: {
      userId?: string;
      guestSessionId?: string;
      shippingAddressId?: string;
      guestName: string;
      guestPhone: string;
      guestFullAddress: string;
      guestCity: string;
    };

    if ('userId' in owner) {
      if (!('shippingAddressId' in input)) {
        throw new AppError(
          400,
          'SHIPPING_ADDRESS_REQUIRED',
          'Authenticated checkout requires shippingAddressId',
        );
      }
      const [user, address] = await Promise.all([
        checkoutRepository.findUser(transaction, owner.userId),
        checkoutRepository.findAddress(
          transaction,
          owner.userId,
          input.shippingAddressId,
        ),
      ]);
      if (!user || !user.isActive || user.role !== UserRole.customer) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      if (!address) {
        throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address was not found');
      }
      delivery = {
        userId: owner.userId,
        shippingAddressId: address.id,
        guestName: user.name,
        guestPhone: address.phone,
        guestFullAddress: address.fullAddress,
        guestCity: address.city,
      };
    } else {
      if (!('guest' in input)) {
        throw new AppError(
          400,
          'GUEST_DELIVERY_REQUIRED',
          'Guest checkout requires delivery details',
        );
      }
      delivery = {
        guestSessionId: owner.sessionId,
        guestName: input.guest.name,
        guestPhone: input.guest.phone,
        guestFullAddress: input.guest.fullAddress,
        guestCity: input.guest.city,
      };
    }

    let subtotal = new Prisma.Decimal(0);
    const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
    for (const item of cartState.items) {
      if (item.variant.product.status !== ProductStatus.active) {
        throw new AppError(
          409,
          'PRODUCT_NOT_SELLABLE',
          `${item.variant.product.name} is no longer available`,
        );
      }
      if (item.variant.stockQty < item.qty) {
        throw new AppError(
          409,
          'INSUFFICIENT_STOCK',
          `Insufficient stock for ${item.variant.sku}`,
        );
      }
      subtotal = subtotal.plus(item.variant.price.mul(item.qty));
      orderItems.push({
        variantId: item.variant.id,
        productName: item.variant.product.name,
        productImageUrl: firstProductImage(item.variant.product.images) ?? null,
        variantSku: item.variant.sku,
        variantSize: item.variant.size,
        variantColor: item.variant.color,
        qty: item.qty,
        price: item.variant.price,
      });
    }

    const shippingFee = new Prisma.Decimal(envVariables.SHIPPING_FEE);
    const total = subtotal.plus(shippingFee);
    const order = await checkoutRepository.createOrder(transaction, {
      orderNumber: createOrderNumber(),
      status: OrderStatus.pending,
      subtotal,
      shippingFee,
      total,
      paymentMethod: WebPaymentMethod.qr,
      paymentStatus: OrderPaymentStatus.unpaid,
      ...delivery,
      items: { create: orderItems },
      payments: {
        create: {
          method: WebPaymentMethod.qr,
          status: PaymentStatus.awaiting_proof,
          amount: total,
        },
      },
    });
    await checkoutRepository.clearCart(transaction, cart.id);

    const payment = order.payments[0]!;
    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal.toFixed(2),
        shippingFee: order.shippingFee.toFixed(2),
        total: order.total.toFixed(2),
        createdAt: order.createdAt,
      },
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount.toFixed(2),
        createdAt: payment.createdAt,
      },
      paymentInstructions: paymentInstructions(order),
    };
  });
}
