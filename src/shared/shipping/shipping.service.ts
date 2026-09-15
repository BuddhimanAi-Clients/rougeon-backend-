import { createHash } from 'node:crypto';
import { InventoryReason, InventorySource, OrderStatus, Prisma, ShipmentBookingStatus } from '@prisma/client';
import { envVariables } from '../../configs/env.config.js';
import { AppError } from '../errors/app-error.js';
import { createEmailOutbox } from '../email/email.service.js';
import { changeInventory } from '../inventory/inventory.service.js';
import * as repository from './shipping.repository.js';

type BookingInput = { pickupBranch: string; destinationBranch: string; deliveryType: string; packageDescription?: string; weightGrams?: number; collectionAmount?: string };
type WebhookInput = { order_id?: string; order_ids?: string[]; status?: string; event?: string; timestamp?: string; test?: boolean };

function safeMessage(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : 'Courier booking failed'; }
function carrierState(event: string, status: string) {
  const value = `${event} ${status}`.toLowerCase().replace(/[ -]+/g, '_');
  return {
    delivered: /delivery_completed|delivered|delivery_success/.test(value),
    returnedToWarehouse: /returned_to_(warehouse|sender)|return_(completed|delivered|received)/.test(value),
  };
}
function emailReceipt(order: { orderNumber: string; total: Prisma.Decimal; shippingFee: Prisma.Decimal; items: Array<{ productName: string; productImageUrl: string | null; variantSize: string; variantColor: string; qty: number; price: Prisma.Decimal }> }) {
  const items = order.items.map((item) => `<li>${item.productImageUrl?.startsWith('https://') ? `<img src="${item.productImageUrl.replace(/[&<>"']/g, '')}" alt="${item.productName.replace(/[&<>"']/g, '')}" width="64" height="64" /> ` : ''}${item.qty} × ${item.productName.replace(/[&<>"']/g, '')} (${item.variantSize}/${item.variantColor}) — NPR ${item.price.mul(item.qty).toFixed(2)}</li>`).join('');
  return `<main><h1>ROGUEON</h1><p>Receipt for <strong>${order.orderNumber}</strong></p><ul>${items}</ul><p>Shipping: NPR ${order.shippingFee.toFixed(2)}<br><strong>Total: NPR ${order.total.toFixed(2)}</strong></p></main>`;
}

export async function bookNcmShipment(orderId: string, input: BookingInput) {
  if (!envVariables.NCM_API_BASE_URL || !envVariables.NCM_API_TOKEN) throw new AppError(503, 'NCM_NOT_CONFIGURED', 'Nepal Can Move is not configured yet');
  const pending = await repository.runTransaction(async (tx) => {
    if ((await repository.lockOrder(tx, orderId)).length === 0) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    const order = await repository.orderForBooking(tx, orderId);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
    if (order.status !== OrderStatus.packed) throw new AppError(409, 'ORDER_NOT_PACKED', 'Pack the order before booking delivery');
    if (order.shipment?.bookingStatus === ShipmentBookingStatus.booked) throw new AppError(409, 'SHIPMENT_ALREADY_BOOKED', 'This order already has a Nepal Can Move shipment');
    if (order.shipment?.bookingStatus === ShipmentBookingStatus.pending) throw new AppError(409, 'SHIPMENT_BOOKING_IN_PROGRESS', 'Courier booking is already in progress');
    return repository.createPendingShipment(tx, { orderId, pickupBranch: input.pickupBranch, destinationBranch: input.destinationBranch, deliveryType: input.deliveryType, ...(input.packageDescription ? { packageDescription: input.packageDescription } : {}), ...(input.weightGrams ? { weightGrams: input.weightGrams } : {}), collectionAmount: order.paymentMethod === 'cod' ? order.codCollectionAmount : new Prisma.Decimal(input.collectionAmount ?? '0') });
  });
  try {
    const order = await repository.runTransaction((tx) => repository.orderForBooking(tx, orderId));
    if (!order) throw new Error('Order disappeared during courier booking');
    const collectionAmount = order.paymentMethod === 'cod' ? order.codCollectionAmount.toFixed(2) : input.collectionAmount ?? '0';
    const response = await fetch(new URL('/api/v1/order/create', envVariables.NCM_API_BASE_URL), { method: 'POST', headers: { Authorization: `Token ${envVariables.NCM_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: order.guestName, phone: order.guestPhone, address: order.guestFullAddress, fbranch: input.pickupBranch, branch: input.destinationBranch, package: input.packageDescription ?? `ROGUEON ${order.orderNumber}`, vref_id: order.orderNumber, delivery_type: input.deliveryType, weight: input.weightGrams ? Math.max(1, input.weightGrams / 1000) : 1, cod_charge: collectionAmount }) });
    const payload = await response.json().catch(() => ({})) as { orderid?: string | number; message?: string };
    if (!response.ok || !payload.orderid) throw new Error(payload.message ?? `NCM responded ${response.status}`);
    return repository.runTransaction(async (tx) => {
      const booked = await repository.completeBookingInTransaction(tx, pending.id, String(payload.orderid));
      await tx.order.updateMany({ where: { id: orderId, status: OrderStatus.packed }, data: { status: OrderStatus.shipped } });
      return booked;
    });
  } catch (error) { await repository.failShipment(pending.id, safeMessage(error)); throw new AppError(502, 'NCM_BOOKING_FAILED', 'Nepal Can Move could not create this shipment. Review the details and retry.'); }
}

export async function processNcmWebhook(input: WebhookInput) {
  const ids = input.order_id ? [input.order_id] : Array.isArray(input.order_ids) ? input.order_ids : [];
  const status = input.status?.trim() || input.event?.trim();
  const event = input.event?.trim() || input.status?.trim();
  if (!ids.length || !status || !event) throw new AppError(400, 'INVALID_NCM_WEBHOOK', 'Webhook payload is missing an order reference or carrier state');
  const occurredAt = input.timestamp && !Number.isNaN(Date.parse(input.timestamp)) ? new Date(input.timestamp) : null;
  for (const carrierOrderId of ids) {
    const shipment = await repository.findByCarrierOrderId(String(carrierOrderId));
    if (!shipment || input.test) continue;
    const payloadHash = createHash('sha256').update(JSON.stringify({ carrierOrderId, status, event, timestamp: input.timestamp ?? null })).digest('hex');
    try { await repository.addEvent({ shipmentId: shipment.id, event, status, occurredAt, payloadHash, rawPayload: input as Prisma.InputJsonValue, isTest: false }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue; throw error; }
    await repository.updateCarrierStatus(shipment.id, status, occurredAt);
    const state = carrierState(event, status);
    if (state.delivered) {
      await repository.runTransaction(async (tx) => {
        await tx.order.updateMany({ where: { id: shipment.orderId, status: OrderStatus.shipped }, data: { status: OrderStatus.delivered } });
        const recipient = shipment.order.customerProfile?.normalizedEmail ?? shipment.order.user?.email ?? shipment.order.guestEmail;
        if (recipient) await createEmailOutbox({ kind: 'web_delivery_receipt', recipientEmail: recipient, deduplicationKey: `web-delivery-receipt:${shipment.orderId}`, payload: { subject: `ROGUEON delivery receipt — ${shipment.order.orderNumber}`, text: `Your ROGUEON order ${shipment.order.orderNumber} was delivered. Total: NPR ${shipment.order.total.toFixed(2)}.`, html: emailReceipt(shipment.order) }, }, tx);
      });
    }
    if (state.returnedToWarehouse) {
      await repository.runTransaction(async (tx) => {
        if ((await repository.lockOrder(tx, shipment.orderId)).length === 0) return;
        const current = await tx.order.findUnique({ where: { id: shipment.orderId }, include: { items: true } });
        if (!current || current.status === OrderStatus.cancelled || current.status === OrderStatus.delivered) return;
        for (const item of current.items) {
          await changeInventory({ transaction: tx, variantId: item.variantId, changeQty: item.qty, reason: InventoryReason.restock, source: InventorySource.admin, referenceId: current.id });
        }
        await tx.order.update({ where: { id: current.id }, data: { status: OrderStatus.cancelled } });
      });
    }
  }
}
