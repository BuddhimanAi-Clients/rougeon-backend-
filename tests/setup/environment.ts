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
