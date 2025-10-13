/**
 * Application Constants
 */

export const APP_NAME = 'Sample Project';
export const VERSION = '1.0.0';
export const API_BASE_URL = 'http://localhost:3000/api';

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export const TOKEN_EXPIRATION_HOURS = 24;
export const REFRESH_TOKEN_EXPIRATION_DAYS = 30;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];

export const PASSWORD_MIN_LENGTH = 8;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

export const CACHE_TTL_SECONDS = 3600; // 1 hour

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;
