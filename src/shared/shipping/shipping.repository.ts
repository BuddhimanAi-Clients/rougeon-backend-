import { Prisma, ShipmentBookingStatus } from '@prisma/client';
import { prisma } from '../../configs/database.config.js';

export function runTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) { return prisma.$transaction(operation); }

export function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  return tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`);
}

export function orderForBooking(tx: Prisma.TransactionClient, id: string) {
  return tx.order.findUnique({ where: { id }, include: { shipment: true } });
}

export function createPendingShipment(tx: Prisma.TransactionClient, data: Prisma.ShipmentUncheckedCreateInput) {
  return tx.shipment.create({ data });
}

export function failShipment(id: string, bookingError: string) {
  return prisma.shipment.update({ where: { id }, data: { bookingStatus: ShipmentBookingStatus.failed, bookingError } });
}

export function completeBooking(id: string, carrierOrderId: string) {
  return prisma.shipment.update({ where: { id }, data: { bookingStatus: ShipmentBookingStatus.booked, carrierOrderId, bookingError: null } });
}

export function completeBookingInTransaction(tx: Prisma.TransactionClient, id: string, carrierOrderId: string) {
  return tx.shipment.update({ where: { id }, data: { bookingStatus: ShipmentBookingStatus.booked, carrierOrderId, bookingError: null } });
}

export function findByCarrierOrderId(carrierOrderId: string) {
  return prisma.shipment.findUnique({ where: { carrierOrderId }, include: { order: { include: { user: true, customerProfile: true, items: true } } } });
}

export function addEvent(data: Prisma.ShipmentEventUncheckedCreateInput) {
  return prisma.shipmentEvent.create({ data });
}

export function updateCarrierStatus(shipmentId: string, status: string, occurredAt: Date | null) {
  return prisma.shipment.update({ where: { id: shipmentId }, data: { carrierStatus: status, carrierStatusAt: occurredAt ?? new Date() } });
}
