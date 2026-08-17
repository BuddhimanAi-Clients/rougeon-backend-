import type { InventoryReason, InventorySource, Prisma } from '@prisma/client';

export type InventoryTransaction = Prisma.TransactionClient;

export type InventoryChangeInput = {
  transaction: InventoryTransaction;
  variantId: string;
  changeQty: number;
  reason: InventoryReason;
  source: InventorySource;
  referenceId: string;
  allowNegative?: boolean;
};

export type InventoryChangeResult = {
  variantId: string;
  previousStock: number;
  stockQty: number;
  changeQty: number;
  inventoryLogId: string;
};
