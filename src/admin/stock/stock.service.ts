import { InventoryReason, InventorySource } from '@prisma/client';
import { paginatedResult } from '../../shared/http/pagination.js';
import { changeInventory } from '../../shared/inventory/inventory.service.js';
import type { StockLogsQuery } from './stock.schemas.js';
import * as stockRepository from './stock.repository.js';

export function restock(variantId: string, quantity: number, adminId: string) {
  return stockRepository.runStockTransaction((transaction) =>
    changeInventory({
      transaction,
      variantId,
      changeQty: quantity,
      reason: InventoryReason.restock,
      source: InventorySource.admin,
      referenceId: adminId,
    }),
  );
}

export function adjust(variantId: string, adjustment: number, adminId: string) {
  return stockRepository.runStockTransaction((transaction) =>
    changeInventory({
      transaction,
      variantId,
      changeQty: adjustment,
      reason: InventoryReason.adjustment,
      source: InventorySource.admin,
      referenceId: adminId,
    }),
  );
}

export async function listLogs(query: StockLogsQuery) {
  const [logs, total] = await stockRepository.listInventoryLogs(query);
  return paginatedResult(logs, total, query);
}
