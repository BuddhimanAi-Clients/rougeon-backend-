import type { ErrorRequestHandler } from 'express';
import { envVariables } from '../../configs/env.config.js';
import { logger } from '../../configs/logger.config.js';
import { AppError } from './app-error.js';
import { mapPrismaError } from './prisma-error.js';

function isMalformedJsonError(error: unknown): error is SyntaxError & { status: 400 } {
  return (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400 &&
    'body' in error
  );
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  if (isMalformedJsonError(error)) {
    response.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
      },
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
    return;
  }

  const prismaError = mapPrismaError(error);
  if (prismaError) {
    response.status(prismaError.statusCode).json({
      error: {
        code: prismaError.code,
        message: prismaError.message,
      },
    });
    return;
  }

  logger.error('Unexpected request error', {
    method: request.method,
    path: request.originalUrl,
    userId: request.auth?.user.id,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : { message: 'Non-Error value thrown' },
  });

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        envVariables.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
    },
  });
};
