import type { DashboardSalesQuery } from './dashboard.schemas.js';
import * as dashboardRepository from './dashboard.repository.js';

function utcDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function boundaries(query: DashboardSalesQuery) {
  const now = new Date();
  if (query.date) {
    const start = utcDay(query.date);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { label: query.date, start, end };
  }
  if (query.from && query.to) {
    const start = utcDay(query.from);
    const end = utcDay(query.to);
    end.setUTCDate(end.getUTCDate() + 1);
    return { label: `${query.from}:${query.to}`, start, end };
  }

  const range = query.range ?? 'today';
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === 'week') {
    const mondayOffset = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - mondayOffset);
  } else if (range === 'month') {
    start.setUTCDate(1);
  }
  const end = new Date(start);
  if (range === 'today') end.setUTCDate(end.getUTCDate() + 1);
  if (range === 'week') end.setUTCDate(end.getUTCDate() + 7);
  if (range === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  return { label: range, start, end };
}

export async function sales(query: DashboardSalesQuery) {
  const { label, start, end } = boundaries(query);
  const aggregate = await dashboardRepository.aggregateSales(start, end);
  const total = aggregate.webTotal.plus(aggregate.posTotal);
  return {
    range: label,
    totalSales: Number(total.toFixed(2)),
    webSales: Number(aggregate.webTotal.toFixed(2)),
    posSales: Number(aggregate.posTotal.toFixed(2)),
    orderCount: aggregate.webCount,
    saleCount: aggregate.posCount,
  };
}

export async function lowStock(threshold: number) {
  const variants = await dashboardRepository.findLowStock(threshold);
  return { threshold, count: variants.length, data: variants };
}
