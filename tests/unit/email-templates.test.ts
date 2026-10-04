import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';

process.env.NODE_ENV ??= 'test';
process.env.SERVER_URL ??= 'http://localhost:3000';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';
process.env.BETTER_AUTH_SECRET ??= 'unit-test-secret-unit-test-secret-0000';
process.env.STORE_NAME ??= 'ROGUEON Test Store';
process.env.STORE_ADDRESS ??= 'Test Store Address';

const d = (value: string) => new Prisma.Decimal(value);
const templates = await import('../../src/shared/email/email-templates.js');

const item = {
  productName: 'Requiem <Zip> Hoodie',
  productImageUrl: 'https://cdn.example.com/hoodie.jpg',
  variantSize: 'M',
  variantColor: 'Grey',
  qty: 2,
  price: d('4500.00'),
  lineTotal: d('9000.00'),
};

test('money is formatted with thousands separators', () => {
  assert.equal(templates.formatMoney(d('1234567.5')), 'NPR 1,234,567.50');
  assert.equal(templates.formatMoney('0'), 'NPR 0.00');
});

test('POS receipt email itemises the bill and escapes customer data', () => {
  const email = templates.posReceiptEmail({
    customerName: 'Asha & <b>Co</b>',
    saleNumber: 'SALE-1',
    createdAt: new Date('2026-10-04T08:00:00Z'),
    cashierName: 'Cashier',
    paymentMethod: 'qr',
    items: [item, { ...item, productName: 'Limited Tee', productImageUrl: null, membershipDiscountEligible: false, qty: 1, price: d('2000.00'), lineTotal: d('2000.00') }],
    subtotal: d('11000.00'),
    merchandiseDiscount: d('900.00'),
    membershipDiscountPercent: d('10.00'),
    tierName: 'Gold',
    discountWaived: false,
    total: d('10100.00'),
    eligibleNetSpend: d('25100.00'),
    newlyUnlockedTier: null,
  });
  assert.match(email.subject, /SALE-1/);
  assert.ok(email.html.includes('Asha &amp; &lt;b&gt;Co&lt;/b&gt;'));
  assert.ok(!email.html.includes('<b>Co</b>'));
  assert.ok(email.html.includes('Requiem &lt;Zip&gt; Hoodie'));
  assert.ok(email.html.includes('src="https://cdn.example.com/hoodie.jpg"'));
  assert.ok(email.html.includes('Member discount not applicable'));
  assert.ok(email.html.includes('Member discount (Gold 10%)'));
  assert.ok(email.html.includes('NPR 10,100.00'));
  assert.ok(email.text.includes('Total paid: NPR 10,100.00'));
});

test('non-https product images are never embedded', () => {
  const email = templates.posReceiptEmail({
    customerName: 'Asha', saleNumber: 'SALE-2', createdAt: new Date(), cashierName: 'Cashier', paymentMethod: 'cash',
    items: [{ ...item, productImageUrl: 'javascript:alert(1)' }],
    subtotal: d('9000.00'), merchandiseDiscount: d('0'), membershipDiscountPercent: d('0'), tierName: null, discountWaived: false,
    total: d('9000.00'), eligibleNetSpend: d('9000.00'), newlyUnlockedTier: null,
  });
  assert.ok(!email.html.includes('javascript:'));
  assert.ok(!email.html.includes('Member discount ('));
});

test('COD order confirmation shows the advance and the amount due on delivery', () => {
  const email = templates.webOrderConfirmedEmail({
    customerName: 'Asha',
    order: {
      orderNumber: 'WEB-1', createdAt: new Date(), paymentMethod: 'cod', items: [item],
      subtotal: d('9000.00'), merchandiseDiscount: d('0'), membershipDiscountPercent: d('0'), tierName: null,
      shippingDeliveryFee: d('150.00'), shippingPickupFee: d('15.00'), shippingFee: d('165.00'), total: d('9165.00'),
      advancePaymentAmount: d('165.00'), codCollectionAmount: d('9000.00'),
      delivery: { name: 'Asha', phone: '9800000000', fullAddress: 'Boudha', city: 'Kathmandu' },
    },
  });
  assert.ok(email.html.includes('Paid in advance by QR'));
  assert.ok(email.html.includes('NPR 9,000.00'));
  assert.ok(email.html.includes('Boudha'));
  assert.ok(email.text.includes('Order total: NPR 9,165.00'));
});

test('auth email text depends only on the action link', () => {
  const first = templates.verifyEmailEmail({ name: 'Asha', url: 'https://example.com/verify?token=abc' });
  const second = templates.verifyEmailEmail({ name: 'Someone else', url: 'https://example.com/verify?token=abc' });
  assert.equal(first.text, second.text);
  assert.ok(first.html.includes('href="https://example.com/verify?token=abc"'));
  assert.ok(templates.resetPasswordEmail({ url: 'https://example.com/reset' }).html.includes('Reset password'));
});
