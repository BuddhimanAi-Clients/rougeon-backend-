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
  NCM_API_BASE_URL: z.url().optional(),
  NCM_API_TOKEN: z.string().trim().min(1).optional(),
  NCM_WEBHOOK_SECRET: z.string().trim().min(32).optional(),
  NCM_DEFAULT_PICKUP_BRANCH: z.string().trim().min(1).max(120).optional(),
  // Legacy static QR fields remain optional while existing installations move
  // to the Admin-managed QR configuration table.
  PAYMENT_QR_IMAGE_URL: z.url().optional(),
  PAYMENT_PROVIDER_NAME: z.string().trim().min(1).max(120).optional(),
  PAYMENT_ACCOUNT_NAME: z.string().trim().min(1).max(180).optional(),
  PAYMENT_ACCOUNT_IDENTIFIER: z.string().trim().min(1).max(180).optional(),
  PAYMENT_INSTRUCTIONS: z.string().trim().min(1).max(1_000).optional(),
  R2_ENDPOINT: z.url().optional(),
  R2_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  R2_BUCKET: z.string().trim().min(3).max(63).optional(),
  R2_PUBLIC_BASE_URL: z.url().optional(),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().trim().email().optional(),
  // Development defaults to console-only email. Set to resend only when
  // deliberately testing a real Resend integration from localhost.
  EMAIL_DELIVERY_MODE: z.enum(['console', 'resend']).optional(),
  WEB_APP_URL: z.url().optional(),
  REDIS_URL: z.string().url().optional(),
  BUSINESS_TIMEZONE: z.string().trim().min(1).default('Asia/Kathmandu'),
  EMAIL_OUTBOX_ENCRYPTION_KEY: z.string().trim().min(32).optional(),
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
