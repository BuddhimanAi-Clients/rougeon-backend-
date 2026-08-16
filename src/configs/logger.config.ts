import winston from 'winston';
import { envVariables } from './env.config.js';

const sensitiveKeys = new Set([
  'apikey',
  'authorization',
  'betterauthsecret',
  'clientsecret',
  'cookie',
  'databaseurl',
  'password',
  'passwordhash',
  'refreshtoken',
  'resettoken',
  'secret',
  'sessiontoken',
  'token',
  'verificationtoken',
]);

function redactSensitiveValues(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValues(item, seen));
  }

  if (value === null || typeof value !== 'object' || value instanceof Error) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      const normalizedKey = key.replaceAll(/[-_]/g, '').toLowerCase();
      return [
        key,
        sensitiveKeys.has(normalizedKey)
          ? '[REDACTED]'
          : redactSensitiveValues(nestedValue, seen),
      ];
    }),
  );
}

const redact = winston.format((info) => {
  for (const key of Object.keys(info)) {
    info[key] = redactSensitiveValues(info[key]);
  }

  return info;
});

const productionFormat = winston.format.combine(
  redact(),
  winston.format.errors({ stack: true }),
  winston.format.timestamp(),
  winston.format.json(),
);

const developmentFormat = winston.format.combine(
  redact(),
  winston.format.errors({ stack: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.simple(),
);

export const logger = winston.createLogger({
  level: envVariables.LOG_LEVEL,
  format:
    envVariables.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  transports: [new winston.transports.Console()],
});
