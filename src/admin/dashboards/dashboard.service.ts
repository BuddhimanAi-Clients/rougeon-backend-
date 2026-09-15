import type { DashboardSalesQuery } from './dashboard.schemas.js';
import { Prisma } from '@prisma/client';
import * as dashboardRepository from './dashboard.repository.js';
import { localDateParts, localDayBounds } from '../../shared/calendar/calendar.service.js';

function dateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

function boundaries(query: DashboardSalesQuery) {
  const now = localDateParts();
  if (query.date) {
    return { label: query.date, ...localDayBounds(dateParts(query.date)) };
  }
  if (query.from && query.to) {
    const start = localDayBounds(dateParts(query.from)).start;
    const end = localDayBounds(dateParts(query.to)).end;
    return { label: `${query.from}:${query.to}`, start, end };
  }

  const range = query.range ?? 'today';
  const startParts = { ...now };
  if (range === 'week') {
    const weekday = new Date(Date.UTC(now.year, now.month - 1, now.day)).getUTCDay();
    const mondayOffset = (weekday + 6) % 7;
    const base = new Date(Date.UTC(now.year, now.month - 1, now.day - mondayOffset));
    startParts.year = base.getUTCFullYear(); startParts.month = base.getUTCMonth() + 1; startParts.day = base.getUTCDate();
  } else if (range === 'month') {
    startParts.day = 1;
  } else if (range === 'year') {
    startParts.month = 1; startParts.day = 1;
  }
  const start = localDayBounds(startParts).start;
  const endBase = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day + (range === 'today' ? 1 : range === 'week' ? 7 : range === 'month' ? 32 : 366)));
  const monthEnd = range === 'month' ? { year: startParts.year + (startParts.month === 12 ? 1 : 0), month: startParts.month === 12 ? 1 : startParts.month + 1, day: 1 } : range === 'year' ? { year: startParts.year + 1, month: 1, day: 1 } : { year: endBase.getUTCFullYear(), month: endBase.getUTCMonth() + 1, day: endBase.getUTCDate() };
  return { label: range, start, end: localDayBounds(monthEnd).start };
}

export async function sales(query: DashboardSalesQuery) {
  const { label, start, end } = boundaries(query);
  const [aggregate, products] = await Promise.all([dashboardRepository.aggregateSales(start, end), dashboardRepository.aggregateProductSales(start, end)]);
  const total = aggregate.webTotal.plus(aggregate.posTotal);
  const byName = new Map<string, { productName: string; productImageUrl: string | null; posUnits: number; webUnits: number; posRevenue: Prisma.Decimal; webRevenue: Prisma.Decimal }>();
  for (const [source, rows] of [['web', products.web], ['pos', products.pos]] as const) for (const row of rows) {
    const current = byName.get(row.productName) ?? { productName: row.productName, productImageUrl: row.productImageUrl, posUnits: 0, webUnits: 0, posRevenue: new Prisma.Decimal(0), webRevenue: new Prisma.Decimal(0) };
    if (!current.productImageUrl) current.productImageUrl = row.productImageUrl;
    if (source === 'web') { current.webUnits += Number(row.units); current.webRevenue = current.webRevenue.plus(row.revenue); } else { current.posUnits += Number(row.units); current.posRevenue = current.posRevenue.plus(row.revenue); }
    byName.set(row.productName, current);
  }
  const topProducts = [...byName.values()].map((row) => ({ ...row, units: row.posUnits + row.webUnits, revenue: Number(row.posRevenue.plus(row.webRevenue).toFixed(2)), posRevenue: Number(row.posRevenue.toFixed(2)), webRevenue: Number(row.webRevenue.toFixed(2)) })).sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 10);
  return {
    range: label,
    totalSales: Number(total.toFixed(2)),
    webSales: Number(aggregate.webTotal.toFixed(2)),
    posSales: Number(aggregate.posTotal.toFixed(2)),
    orderCount: aggregate.webCount,
    saleCount: aggregate.posCount,
    unitsSold: topProducts.reduce((sum, row) => sum + row.units, 0),
    topProducts,
  };
}

export async function lowStock(threshold: number) {
  const variants = await dashboardRepository.findLowStock(threshold);
  return { threshold, count: variants.length, data: variants };
}
