import { app } from './app.js';
import { prisma } from './configs/database.config.js';
import { envVariables } from './configs/env.config.js';
import { logger } from './configs/logger.config.js';

async function startServer() {
  await prisma.$connect();

  const server = app.listen(envVariables.PORT, () => {
    logger.info('Server started', {
      port: envVariables.PORT,
      url: envVariables.SERVER_URL,
    });
  });

  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info('Server shutdown started', { signal });

    server.close((closeError) => {
      void prisma.$disconnect().finally(() => {
        if (closeError) {
          logger.error('Server shutdown failed', { error: closeError });
          process.exitCode = 1;
          return;
        }

        logger.info('Server shutdown completed');
      });
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer().catch(async (error: unknown) => {
  logger.error('Server failed to start', {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: 'Non-Error value thrown' },
  });
  await prisma.$disconnect();
  process.exitCode = 1;
});
