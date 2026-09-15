import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for integration tests');
}

const parsed = new URL(testDatabaseUrl);
const schema = parsed.searchParams.get('schema') ?? '';
const databaseName = parsed.pathname.replace(/^\//, '');
if (!/test/i.test(schema) && !/test/i.test(databaseName)) {
  throw new Error('TEST_DATABASE_URL must use a database or schema containing "test"');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.SHIPPING_FEE ??= '150.00';
process.env.NCM_PICKUP_FEE ??= '15.00';
process.env.PAYMENT_QR_IMAGE_URL ??= 'https://cdn.example.com/test-payment-qr.png';
process.env.PAYMENT_PROVIDER_NAME ??= 'Test Bank';
process.env.PAYMENT_ACCOUNT_NAME ??= 'ROGUEON Test';
process.env.PAYMENT_ACCOUNT_IDENTIFIER ??= 'TEST-ACCOUNT';
process.env.PAYMENT_INSTRUCTIONS ??= 'Pay the exact test amount.';
process.env.STORE_NAME ??= 'ROGUEON Test Store';
process.env.STORE_ADDRESS ??= 'Test Store Address';
