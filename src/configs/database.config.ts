import { PrismaClient } from '@prisma/client';
import { envVariables } from './env.config.js';

const createPrismaClient = () =>
  new PrismaClient({
    datasources: {
      db: {
        url: envVariables.DATABASE_URL,
      },
    },
    log:
      envVariables.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (envVariables.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
