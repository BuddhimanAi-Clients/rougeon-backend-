import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const moneySchema = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Must be a non-negative amount with at most two decimal places');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SERVER_URL: z.url(),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  TEST_DATABASE_URL: z.string().startsWith('postgresql://').optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  SHIPPING_FEE: moneySchema.default('150.00'),
  PAYMENT_QR_IMAGE_URL: z.url(),
  PAYMENT_PROVIDER_NAME: z.string().trim().min(1).max(120),
  PAYMENT_ACCOUNT_NAME: z.string().trim().min(1).max(180),
  PAYMENT_ACCOUNT_IDENTIFIER: z.string().trim().min(1).max(180),
  PAYMENT_INSTRUCTIONS: z.string().trim().min(1).max(1_000),
  STORE_NAME: z.string().trim().min(1).max(180),
  STORE_ADDRESS: z.string().trim().min(1).max(300),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('debug'),
});

const parsedEnvironment = envSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const invalidKeys = [
    ...new Set(
      parsedEnvironment.error.issues.map((issue) =>
        issue.path.length > 0 ? issue.path.join('.') : 'environment',
      ),
    ),
  ];

  throw new Error(`Invalid environment configuration: ${invalidKeys.join(', ')}`);
}

export const envVariables = parsedEnvironment.data;
