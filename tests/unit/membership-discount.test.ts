import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { computeMembershipDiscount } from '../../src/shared/membership/discount.js';

const d = (value: string) => new Prisma.Decimal(value);
const line = (price: string, qty: number, eligible = true) => ({ price: d(price), qty, eligible });

test('a fully eligible bill matches the whole-bill percentage', () => {
  const result = computeMembershipDiscount([line('4500.00', 1), line('1999.00', 2)], d('10'));
  assert.equal(result.subtotal.toFixed(2), '8498.00');
  assert.equal(result.eligibleSubtotal.toFixed(2), '8498.00');
  assert.equal(result.discount.toFixed(2), '849.80');
  assert.deepEqual(result.lineDiscounts.map((value) => value.toFixed(2)), ['450.00', '399.80']);
});

test('ineligible products are excluded from the discount', () => {
  const result = computeMembershipDiscount([line('5000.00', 1, false), line('2000.00', 1)], d('10'));
  assert.equal(result.subtotal.toFixed(2), '7000.00');
  assert.equal(result.eligibleSubtotal.toFixed(2), '2000.00');
  assert.equal(result.discount.toFixed(2), '200.00');
  assert.deepEqual(result.lineDiscounts.map((value) => value.toFixed(2)), ['0.00', '200.00']);
});

test('no discount when nothing is eligible or the percentage is zero', () => {
  const none = computeMembershipDiscount([line('5000.00', 1, false)], d('15'));
  assert.equal(none.discount.toFixed(2), '0.00');
  assert.deepEqual(none.lineDiscounts.map((value) => value.toFixed(2)), ['0.00']);
  const zero = computeMembershipDiscount([line('5000.00', 1)], d('0'));
  assert.equal(zero.discount.toFixed(2), '0.00');
  assert.equal(zero.subtotal.toFixed(2), '5000.00');
});

test('line discounts always add up to the rounded total', () => {
  const result = computeMembershipDiscount(
    [line('33.33', 1), line('33.33', 1), line('33.33', 1), line('999.99', 3)],
    d('7.5'),
  );
  const sum = result.lineDiscounts.reduce((total, value) => total.plus(value), d('0'));
  assert.equal(sum.toFixed(2), result.discount.toFixed(2));
  assert.equal(result.discount.toFixed(2), '232.50');
  assert.ok(result.lineDiscounts.every((value) => !value.isNegative()));
});
