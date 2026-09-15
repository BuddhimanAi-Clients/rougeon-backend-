import DateConverter from '@remotemerge/nepali-date-converter';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { envVariables } from '../../configs/env.config.js';
import { AppError } from '../errors/app-error.js';

export type CalendarDate = { year: number; month: number; day: number };

function padded(value: number) { return String(value).padStart(2, '0'); }
function iso(value: CalendarDate) { return `${value.year}-${padded(value.month)}-${padded(value.day)}`; }
function validAd(value: CalendarDate) {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return date.getUTCFullYear() === value.year && date.getUTCMonth() === value.month - 1 && date.getUTCDate() === value.day;
}

export function parseAdDate(value: CalendarDate) {
  if (!Number.isInteger(value.year) || !Number.isInteger(value.month) || !Number.isInteger(value.day) || !validAd(value)) {
    throw new AppError(422, 'INVALID_AD_DATE', 'Enter a valid English (AD) date');
  }
  return new Date(Date.UTC(value.year, value.month - 1, value.day));
}

export function bsToAd(value: CalendarDate) {
  try {
    const result = new DateConverter(iso(value)).toAd();
    return { date: parseAdDate({ year: result.year, month: result.month, day: result.date }), bsMonth: value.month, bsDay: value.day };
  } catch {
    throw new AppError(422, 'INVALID_BS_DATE', 'Enter a valid Nepali (BS) date between 1975 and 2099 BS');
  }
}

export function adToBs(value: Date): CalendarDate {
  const result = new DateConverter(value.toISOString().slice(0, 10)).toBs();
  return { year: result.year, month: result.month, day: result.date };
}

export function localDateParts(date = new Date()): CalendarDate {
  const zoned = toZonedTime(date, envVariables.BUSINESS_TIMEZONE);
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1, day: zoned.getDate() };
}

export function membershipYear(date = new Date()) { return localDateParts(date).year; }

export function localDayBounds(value: CalendarDate) {
  const start = fromZonedTime(`${iso(value)}T00:00:00`, envVariables.BUSINESS_TIMEZONE);
  const next = new Date(Date.UTC(value.year, value.month - 1, value.day + 1));
  const end = fromZonedTime(`${next.getUTCFullYear()}-${padded(next.getUTCMonth() + 1)}-${padded(next.getUTCDate())}T00:00:00`, envVariables.BUSINESS_TIMEZONE);
  return { start, end };
}
