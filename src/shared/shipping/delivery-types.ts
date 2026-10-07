// How the parcel reaches the customer. The values are the ones Nepal Can Move
// expects as delivery_type when a shipment is booked.
export const DELIVERY_TYPES = ['Door2Door', 'Door2Branch'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];
export const DEFAULT_DELIVERY_TYPE: DeliveryType = 'Door2Door';
