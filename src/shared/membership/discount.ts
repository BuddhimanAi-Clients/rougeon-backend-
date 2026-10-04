import { Prisma } from '@prisma/client';

export type DiscountLineInput = {
  price: Prisma.Decimal;
  qty: number;
  /** Product-level switch set by an administrator. */
  eligible: boolean;
};

export type DiscountResult = {
  subtotal: Prisma.Decimal;
  /** Sum of the lines the membership percentage is allowed to touch. */
  eligibleSubtotal: Prisma.Decimal;
  /** Total discount, rounded once to two decimal places. */
  discount: Prisma.Decimal;
  /** Per-line share of `discount`, in input order; always sums to `discount`. */
  lineDiscounts: Prisma.Decimal[];
};

const ZERO = new Prisma.Decimal(0);

/**
 * Applies a membership percentage only to eligible lines.
 *
 * The total is rounded once (half up) from the eligible subtotal, which keeps
 * a fully-eligible bill identical to the previous whole-bill calculation. Each
 * eligible line then receives its rounded share and the largest eligible line
 * absorbs any rounding remainder, so the lines always add up to the total.
 */
export function computeMembershipDiscount(
  lines: readonly DiscountLineInput[],
  percent: Prisma.Decimal,
): DiscountResult {
  let subtotal = ZERO;
  let eligibleSubtotal = ZERO;
  for (const line of lines) {
    const lineTotal = line.price.mul(line.qty);
    subtotal = subtotal.plus(lineTotal);
    if (line.eligible) eligibleSubtotal = eligibleSubtotal.plus(lineTotal);
  }

  const applies = percent.gt(0) && eligibleSubtotal.gt(0);
  const discount = applies
    ? eligibleSubtotal.mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    : ZERO;

  const lineDiscounts = lines.map(() => ZERO);
  if (applies) {
    let allocated = ZERO;
    let largestIndex = -1;
    let largestTotal = ZERO;
    lines.forEach((line, index) => {
      if (!line.eligible) return;
      const lineTotal = line.price.mul(line.qty);
      const share = lineTotal.mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      lineDiscounts[index] = share;
      allocated = allocated.plus(share);
      if (largestIndex === -1 || lineTotal.gt(largestTotal)) {
        largestIndex = index;
        largestTotal = lineTotal;
      }
    });
    const remainder = discount.minus(allocated);
    if (largestIndex !== -1 && !remainder.isZero()) {
      lineDiscounts[largestIndex] = lineDiscounts[largestIndex]!.plus(remainder);
    }
  }

  return { subtotal, eligibleSubtotal, discount, lineDiscounts };
}
