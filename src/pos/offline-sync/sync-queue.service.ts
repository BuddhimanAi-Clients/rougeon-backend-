import { logger } from '../../configs/logger.config.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createOfflineSale } from '../sales/sales.service.js';
import type { SyncSalesBody } from './sync.schemas.js';

type SyncedSaleResult = {
  index: number;
  status: 'synced';
  needsReview: boolean;
  replayed: boolean;
  sale: Awaited<ReturnType<typeof createOfflineSale>>['sale'];
};

type FailedSaleResult = {
  index: number;
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
};

export type SyncSaleResult = SyncedSaleResult | FailedSaleResult;

export async function syncQueuedSales(
  staffId: string,
  input: SyncSalesBody,
): Promise<SyncSaleResult[]> {
  const results: SyncSaleResult[] = [];

  for (let index = 0; index < input.sales.length; index += 1) {
    const queuedSale = input.sales[index];

    if (!queuedSale) {
      continue;
    }

    try {
      const result = await createOfflineSale(staffId, {
        clientSaleId: queuedSale.clientSaleId,
        occurredAt: new Date(queuedSale.occurredAt),
        items: queuedSale.items,
        paymentMethod: queuedSale.paymentMethod,
      });
      results.push({
        index,
        status: 'synced',
        needsReview: result.needsReview,
        replayed: result.replayed,
        sale: result.sale,
      });
    } catch (error) {
      if (error instanceof AppError) {
        results.push({
          index,
          status: 'failed',
          error: {
            code: error.code,
            message: error.message,
          },
        });
        continue;
      }

      logger.error('Unexpected POS offline sync error', {
        staffId,
        batchIndex: index,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: 'Non-Error value thrown' },
      });

      results.push({
        index,
        status: 'failed',
        error: {
          code: 'POS_SYNC_FAILED',
          message: 'Sale could not be synced',
        },
      });
    }
  }

  return results;
}
