export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Normalize pagination parameters and calculate total pages
 */
export function normalizePagination(
  params: PaginationParams,
  total: number
): PaginationResult {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    totalPages,
  };
}
