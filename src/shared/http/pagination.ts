import { z } from 'zod';

export const paginationQueryFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export type PaginationInput = {
  page: number;
  limit: number;
};

export function paginationArgs(input: PaginationInput) {
  return {
    skip: (input.page - 1) * input.limit,
    take: input.limit,
  };
}

export function paginatedResult<T>(
  data: T[],
  total: number,
  input: PaginationInput,
) {
  return {
    data,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}
