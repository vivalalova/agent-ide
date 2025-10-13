/**
 * API 相關型別定義
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
  timestamp: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface ResponseMetadata {
  requestId: string;
  duration: number;
  version: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

export interface ListQueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export type ApiResponseSuccess<T> = ApiResponse<T> & { success: true; error: undefined };
export type ApiResponseError = ApiResponse<never> & { success: false; data: never; error: ApiError };

export type ApiResult<T> = ApiResponseSuccess<T> | ApiResponseError;
