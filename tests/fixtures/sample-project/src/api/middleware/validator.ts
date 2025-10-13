/**
 * Validation Middleware
 */

import { ValidationError, ValidationResult } from '../../types/common';
import { ApiResponse } from '../../types/api';

export class ValidatorMiddleware {
  validateEmail(email: string): ValidationResult {
    const errors: ValidationError[] = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      errors.push({
        field: 'email',
        message: 'Invalid email format',
        value: email
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateRequired(value: unknown, fieldName: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (value === null || value === undefined || value === '') {
      errors.push({
        field: fieldName,
        message: `${fieldName} is required`,
        value
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateRequestBody<T>(body: T, requiredFields: string[]): ApiResponse<T> {
    const errors: ValidationError[] = [];

    for (const field of requiredFields) {
      const value = (body as Record<string, unknown>)[field];
      if (value === undefined || value === null) {
        errors.push({
          field,
          message: `${field} is required`,
          value
        });
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        data: undefined as never,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { errors }
        },
        timestamp: Date.now()
      };
    }

    return {
      success: true,
      data: body,
      timestamp: Date.now()
    };
  }
}
