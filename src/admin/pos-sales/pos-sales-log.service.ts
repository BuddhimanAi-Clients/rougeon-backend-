import { AppError } from '../../shared/errors/app-error.js';
import { paginatedResult } from '../../shared/http/pagination.js';
import type { ListPosSalesQuery } from './pos-sales-log.schemas.js';
import * as posSalesRepository from './pos-sales-log.repository.js';

export async function getPosSales(query: ListPosSalesQuery) {
  const [sales, total] = await posSalesRepository.listPosSales(query);
  return paginatedResult(sales, total, query);
}

export async function getPosSale(id: string) {
  const sale = await posSalesRepository.findPosSale(id);
  if (!sale) throw new AppError(404, 'POS_SALE_NOT_FOUND', 'POS sale was not found');
  return sale;
}
