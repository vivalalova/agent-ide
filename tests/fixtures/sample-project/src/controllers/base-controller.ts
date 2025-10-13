/**
 * Base Controller
 */

import { ApiResponse, ApiError } from '../types/api';

export abstract class BaseController {
  protected successResponse<T>(data: T): ApiResponse<T> {
    return {
      success: true,
      data,
      timestamp: Date.now()
    };
  }

  protected errorResponse(code: string, message: string, details?: unknown): ApiResponse<never> {
    const error: ApiError = {
      code,
      message,
      details: details as Record<string, unknown>
    };

    return {
      success: false,
      data: undefined as never,
      error,
      timestamp: Date.now()
    };
  }

  protected handleError(error: unknown): ApiResponse<never> {
    if (error instanceof Error) {
      return this.errorResponse('INTERNAL_ERROR', error.message, { stack: error.stack });
    }

    return this.errorResponse('UNKNOWN_ERROR', 'An unknown error occurred', error);
  }
}
