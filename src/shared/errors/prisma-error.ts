import { Prisma } from '@prisma/client';
import { AppError } from './app-error.js';

export function mapPrismaError(error: unknown): AppError | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return undefined;
  }

  if (error.code === 'P2002') {
    return new AppError(409, 'UNIQUE_CONFLICT', 'A unique value already exists');
  }

  if (error.code === 'P2003') {
    return new AppError(409, 'REFERENCE_CONFLICT', 'The resource is still referenced');
  }

  if (error.code === 'P2025') {
    return new AppError(404, 'NOT_FOUND', 'The requested resource was not found');
  }

  if (error.code === 'P2034') {
    return new AppError(409, 'TRANSACTION_CONFLICT', 'The request conflicted with another update');
  }

  return undefined;
}
