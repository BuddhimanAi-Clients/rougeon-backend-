import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SERVER_URL ??= 'http://localhost:3000';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/rogueon';
process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(40);
process.env.STORE_NAME ??= 'ROGUEON';
process.env.STORE_ADDRESS ??= 'Boudha, Kathmandu';
process.env.SHIPPING_RATE_MODE = 'ncm';
process.env.NCM_PICKUP_FEE = '15.00';
process.env.NCM_DEFAULT_PICKUP_BRANCH = 'CHABAHIL';
process.env.NCM_API_BASE_URL = 'https://ncm.test';

const rates = await import('../../src/shared/shipping/rates.service.js');

test('parseBranches keeps the fields customers search by and drops junk', () => {
  const branches = rates.parseBranches([
    { name: 'POKHARA', district_name: 'Kaski', province_name: 'Gandaki', areas_covered: 'Lakeside, Bagar' },
    { name: 'BIRATNAGAR', district_name: 'Morang', province_name: null, areas_covered: '' },
    { name: 'pokhara' },
    { code: 'no-name' },
    null,
  ]);
  assert.deepEqual(branches.map((branch) => branch.name), ['BIRATNAGAR', 'POKHARA']);
  assert.equal(branches[1]?.district, 'Kaski');
  assert.equal(branches[0]?.areas, null);
});

test('parseCharge accepts only a positive money amount', () => {
  assert.equal(rates.parseCharge({ charge: '170.00' }), '170.00');
  assert.equal(rates.parseCharge({ charge: 120 }), '120');
  assert.equal(rates.parseCharge({ charge: '0' }), null);
  assert.equal(rates.parseCharge({ charge: 'abc' }), null);
  assert.equal(rates.parseCharge({}), null);
});

test('quoteDelivery adds the store charge to the live courier rate', async (context) => {
  const calls: string[] = [];
  let rateFails = false;
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname === '/api/v2/branches') {
      return Response.json([{ name: 'BIRATNAGAR', district_name: 'Morang' }, { name: 'TINKUNE', district_name: 'Kathmandu' }]);
    }
    if (rateFails) return new Response('<html>error</html>', { status: 500 });
    return Response.json({ charge: url.searchParams.get('destination') === 'TINKUNE' ? '120.00' : '170.00' });
  });

  const quote = await rates.quoteDelivery('tinkune');
  assert.equal(quote.branch, 'TINKUNE');
  assert.equal(quote.deliveryFee.toFixed(2), '120.00');
  assert.equal(quote.pickupFee.toFixed(2), '15.00');
  assert.equal(quote.total.toFixed(2), '135.00');
  assert.ok(calls.some((call) => call.includes('creation=CHABAHIL') && call.includes('destination=TINKUNE')));

  // Cached: a second quote does not call the courier again.
  const before = calls.length;
  await rates.quoteDelivery('TINKUNE');
  assert.equal(calls.length, before);

  await assert.rejects(rates.quoteDelivery('NOWHERE'), { code: 'DELIVERY_AREA_INVALID' });
  await assert.rejects(rates.quoteDelivery(null), { code: 'DELIVERY_AREA_REQUIRED' });

  rateFails = true;
  await assert.rejects(rates.quoteDelivery('BIRATNAGAR'), { code: 'SHIPPING_RATE_UNAVAILABLE' });
});

test('quoteDeliveryOptions prices home delivery and branch collection separately', async (context) => {
  const types: string[] = [];
  let branchRate = '120.00';
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/branches') return Response.json([{ name: 'BIRATNAGAR', district_name: 'Morang' }, { name: 'TINKUNE', district_name: 'Kathmandu' }]);
    const type = url.searchParams.get('type') ?? '';
    types.push(type);
    return Response.json({ charge: type === 'D2B' ? branchRate : '170.00' });
  });

  const options = await rates.quoteDeliveryOptions('biratnagar');
  assert.deepEqual(options.map((option) => [option.deliveryType, option.total.toFixed(2)]), [['Door2Door', '185.00'], ['Door2Branch', '135.00']]);
  assert.deepEqual(types, ['Pickup/Collect', 'D2B']);

  const branch = await rates.quoteDelivery('BIRATNAGAR', 'Door2Branch');
  assert.equal(branch.deliveryFee.toFixed(2), '120.00');
  assert.equal(branch.total.toFixed(2), '135.00');

  // NCM answers 0 for a service it does not price: never offer that for free.
  branchRate = '0';
  const fallback = await rates.quoteDeliveryOptions('TINKUNE');
  assert.deepEqual(fallback.map((option) => option.deliveryType), ['Door2Door']);
  await assert.rejects(rates.quoteDelivery('TINKUNE', 'Door2Branch'), { code: 'SHIPPING_RATE_UNAVAILABLE' });
});
