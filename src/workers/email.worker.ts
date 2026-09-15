import { prisma } from '../configs/database.config.js';
import { logger } from '../configs/logger.config.js';
import { dispatchPendingOutbox, startEmailWorker } from '../shared/email/email.service.js';

async function main() {
  await prisma.$connect();
  const worker = startEmailWorker();
  const interval = setInterval(() => { void dispatchPendingOutbox().catch((error: unknown) => logger.warn('Email outbox dispatch failed', { error: error instanceof Error ? error.name : 'unknown' })); }, 15_000);
  void dispatchPendingOutbox();
  const shutdown = async () => { clearInterval(interval); await worker?.close(); await prisma.$disconnect(); };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}
void main();
