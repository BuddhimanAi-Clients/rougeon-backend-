import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error.js';

type RequestSchemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

function formatIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'request';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (request, _response, next) => {
    const validated: NonNullable<typeof request.validated> = {};

    for (const location of ['body', 'params', 'query'] as const) {
      const schema = schemas[location];
      if (!schema) {
        continue;
      }

      const result = schema.safeParse(request[location]);
      if (!result.success) {
        next(
          new AppError(
            400,
            'VALIDATION_ERROR',
            formatIssues(result.error.issues),
          ),
        );
        return;
      }

      validated[location] = result.data;
    }

    request.validated = validated;
    next();
  };
}

export function validatedBody<T>(request: Express.Request): T {
  return request.validated?.body as T;
}

export function validatedParams<T>(request: Express.Request): T {
  return request.validated?.params as T;
}

export function validatedQuery<T>(request: Express.Request): T {
  return request.validated?.query as T;
}
