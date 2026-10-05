import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error.js';

export type PosPaymentChoice = 'cash' | 'qr' | 'split';
export type SplitInput = { cashAmount: string; qrAmount: string };

export type ResolvedPayment = {
  cashAmount: Prisma.Decimal;
  qrAmount: Prisma.Decimal;
  // True when an offline split did not add up and was corrected for review.
  adjusted: boolean;
};

/**
 * Works out how much of a sale was paid in cash and how much by QR.
 *
 * The total is always the server's own figure. A live split that does not add
 * up to it is rejected so the cashier can correct the amounts before taking
 * money. An offline sale has already happened, so it is never rejected: the
 * QR amount is kept (capped at the total), cash covers the remainder, and the
 * sale is flagged for review.
 */
export function resolvePosPayment(
  method: PosPaymentChoice,
  total: Prisma.Decimal,
  split: SplitInput | undefined,
  options: { lenient: boolean },
): ResolvedPayment {
  const zero = new Prisma.Decimal(0);
  if (method === 'cash') return { cashAmount: total, qrAmount: zero, adjusted: false };
  if (method === 'qr') return { cashAmount: zero, qrAmount: total, adjusted: false };

  if (!split) {
    throw new AppError(400, 'POS_SPLIT_AMOUNTS_REQUIRED', 'Enter the cash and QR amounts for a split payment');
  }
  const cashAmount = new Prisma.Decimal(split.cashAmount);
  const qrAmount = new Prisma.Decimal(split.qrAmount);
  if (cashAmount.plus(qrAmount).equals(total) && cashAmount.gt(0) && qrAmount.gt(0)) {
    return { cashAmount, qrAmount, adjusted: false };
  }
  if (!options.lenient) {
    throw new AppError(
      409,
      'POS_SPLIT_TOTAL_MISMATCH',
      `Cash and QR must add up to the sale total of Rs. ${total.toFixed(2)}. Update the amounts and try again.`,
    );
  }
  const keptQr = Prisma.Decimal.min(Prisma.Decimal.max(qrAmount, zero), total);
  return { cashAmount: total.minus(keptQr), qrAmount: keptQr, adjusted: true };
}
