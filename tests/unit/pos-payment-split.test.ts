import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { resolvePosPayment } from '../../src/pos/sales/payment-split.js';
import { createSaleBodySchema } from '../../src/pos/sales/sales.schemas.js';

const total = new Prisma.Decimal('4500.00');
const strict = { lenient: false };

test('single-method sales put the whole total on one side', () => {
  const cash = resolvePosPayment('cash', total, undefined, strict);
  assert.equal(cash.cashAmount.toFixed(2), '4500.00');
  assert.equal(cash.qrAmount.toFixed(2), '0.00');
  const qr = resolvePosPayment('qr', total, undefined, strict);
  assert.equal(qr.cashAmount.toFixed(2), '0.00');
  assert.equal(qr.qrAmount.toFixed(2), '4500.00');
});

test('a split that adds up to the total is accepted as entered', () => {
  const split = resolvePosPayment('split', total, { cashAmount: '2500', qrAmount: '2000.00' }, strict);
  assert.equal(split.cashAmount.toFixed(2), '2500.00');
  assert.equal(split.qrAmount.toFixed(2), '2000.00');
  assert.equal(split.adjusted, false);
});

test('a live split that does not add up is rejected', () => {
  assert.throws(() => resolvePosPayment('split', total, { cashAmount: '2500', qrAmount: '1000' }, strict), { code: 'POS_SPLIT_TOTAL_MISMATCH' });
  assert.throws(() => resolvePosPayment('split', total, { cashAmount: '4500', qrAmount: '0' }, strict), { code: 'POS_SPLIT_TOTAL_MISMATCH' });
  assert.throws(() => resolvePosPayment('split', total, undefined, strict), { code: 'POS_SPLIT_AMOUNTS_REQUIRED' });
});

test('an offline split that does not add up is corrected and flagged', () => {
  const short = resolvePosPayment('split', total, { cashAmount: '2500', qrAmount: '1000' }, { lenient: true });
  assert.equal(short.qrAmount.toFixed(2), '1000.00');
  assert.equal(short.cashAmount.toFixed(2), '3500.00');
  assert.equal(short.adjusted, true);
  const over = resolvePosPayment('split', total, { cashAmount: '100', qrAmount: '9000' }, { lenient: true });
  assert.equal(over.qrAmount.toFixed(2), '4500.00');
  assert.equal(over.cashAmount.toFixed(2), '0.00');
});

test('the sale request requires split amounts only for split payments', () => {
  const base = { items: [{ variantId: 'v1', qty: 1 }], customerProfileId: 'c1' };
  assert.equal(createSaleBodySchema.safeParse({ ...base, paymentMethod: 'cash' }).success, true);
  assert.equal(createSaleBodySchema.safeParse({ ...base, paymentMethod: 'split' }).success, false);
  assert.equal(createSaleBodySchema.safeParse({ ...base, paymentMethod: 'split', split: { cashAmount: '100', qrAmount: '50.5' } }).success, true);
  assert.equal(createSaleBodySchema.safeParse({ ...base, paymentMethod: 'split', split: { cashAmount: '100', qrAmount: '0' } }).success, false);
  assert.equal(createSaleBodySchema.safeParse({ ...base, paymentMethod: 'cash', split: { cashAmount: '100', qrAmount: '50' } }).success, false);
});
