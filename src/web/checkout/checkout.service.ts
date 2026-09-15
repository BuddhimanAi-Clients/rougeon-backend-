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
import { requireCompleteUserProfile } from '../../shared/customers/customer.service.js';
import { membershipSnapshot, quoteMembership } from '../../shared/membership/membership.service.js';
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
      customerProfileId?: string;
      guestSessionId?: string;
      shippingAddressId?: string;
      guestName: string;
      guestEmail?: string;
      guestPhone: string;
      guestFullAddress: string;
      guestCity: string;
    };

    let membershipDiscountPercent = new Prisma.Decimal(0);
    let membershipTierSnapshot: Prisma.JsonObject | null = null;
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
      const profile = await requireCompleteUserProfile(transaction, owner.userId);
      const membership = await quoteMembership(transaction, profile.id);
      membershipDiscountPercent = membership.discountPercent;
      membershipTierSnapshot = membershipSnapshot(membership.tier);
      delivery = {
        userId: owner.userId,
        customerProfileId: profile.id,
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
        ...(input.guest.email ? { guestEmail: input.guest.email.toLowerCase() } : {}),
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

    const merchandiseDiscount = subtotal.mul(membershipDiscountPercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const discountedMerchandise = subtotal.minus(merchandiseDiscount);
    const shippingDeliveryFee = new Prisma.Decimal(envVariables.SHIPPING_FEE);
    const shippingPickupFee = new Prisma.Decimal(envVariables.NCM_PICKUP_FEE);
    const shippingFee = shippingDeliveryFee.plus(shippingPickupFee);
    const total = discountedMerchandise.plus(shippingFee);
    const qrConfiguration = await checkoutRepository.findActivePaymentQrConfiguration(transaction);
    if (!qrConfiguration) {
      throw new AppError(503, 'PAYMENT_CONFIGURATION_UNAVAILABLE', 'Online payment instructions are not configured. Please try again later.');
    }
    const paymentMethod = input.paymentMethod;
    const codMerchandiseAdvancePercent = paymentMethod === 'cod'
      ? qrConfiguration.codMerchandiseAdvancePercent
      : new Prisma.Decimal(0);
    const advancePaymentAmount = paymentMethod === 'cod'
      ? shippingFee.plus(discountedMerchandise.mul(codMerchandiseAdvancePercent).div(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : total;
    const codCollectionAmount = total.minus(advancePaymentAmount);
    const order = await checkoutRepository.createOrder(transaction, {
      orderNumber: createOrderNumber(),
      status: OrderStatus.pending,
      subtotal,
      merchandiseDiscount,
      membershipDiscountPercent,
      ...(membershipTierSnapshot ? { membershipTierSnapshot } : {}),
      shippingFee,
      shippingDeliveryFee,
      shippingPickupFee,
      total,
      advancePaymentAmount,
      codCollectionAmount,
      codMerchandiseAdvancePercent,
      paymentMethod: paymentMethod === 'cod' ? WebPaymentMethod.cod : WebPaymentMethod.qr,
      paymentStatus: OrderPaymentStatus.unpaid,
      ...delivery,
      items: { create: orderItems },
      payments: {
        create: {
          method: WebPaymentMethod.qr,
          status: PaymentStatus.awaiting_proof,
          amount: advancePaymentAmount,
          qrConfigurationId: qrConfiguration.id,
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
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal.toFixed(2),
        merchandiseDiscount: order.merchandiseDiscount.toFixed(2),
        membershipDiscountPercent: order.membershipDiscountPercent.toFixed(2),
        shippingFee: order.shippingFee.toFixed(2),
        shippingDeliveryFee: order.shippingDeliveryFee.toFixed(2),
        shippingPickupFee: order.shippingPickupFee.toFixed(2),
        total: order.total.toFixed(2),
        advancePaymentAmount: order.advancePaymentAmount.toFixed(2),
        codCollectionAmount: order.codCollectionAmount.toFixed(2),
        codMerchandiseAdvancePercent: order.codMerchandiseAdvancePercent.toFixed(2),
        createdAt: order.createdAt,
      },
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount.toFixed(2),
        createdAt: payment.createdAt,
      },
      paymentInstructions: paymentInstructions({ ...order, total: advancePaymentAmount }, qrConfiguration),
    };
  });
}
