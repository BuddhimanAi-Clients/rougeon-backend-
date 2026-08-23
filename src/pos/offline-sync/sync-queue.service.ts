import { AppError } from '../../shared/errors/app-error.js';
import { createOfflineSale } from '../sales/sales.service.js';
import type { SyncSalesBody } from './sync.schemas.js';

type SyncedSaleResult = {
  index: number;
  status: 'synced';
  needsReview: boolean;
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
      const result = await createOfflineSale(staffId, queuedSale);
      results.push({
        index,
        status: 'synced',
        needsReview: result.needsReview,
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
